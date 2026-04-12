// netlify/functions/chat.js
// Claude AI proxy with rate limiting and daily credit cap

const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `You are Airom, a powerful and intelligent AI assistant built for people who want real results.
Your name is Airom — short for AI Rom — and you are sharp, warm, and genuinely helpful.
You assist with coding, writing, analysis, research, math, brainstorming, and everyday questions.
You give clear, focused answers and never pad responses with unnecessary filler.
Format all code in markdown code blocks with the correct language specified.
When greeting a user for the first time, introduce yourself as Airom warmly and briefly mention what you can help with.`

// ── Limits ────────────────────────────────────────────────────────────────
const DAILY_CREDIT_LIMIT   = 150  // max credits per user per day
const DAILY_MESSAGE_LIMIT  = 80   // max messages per user per day
const RATE_LIMIT_WINDOW_MS = 60 * 1000  // 1 minute window
const RATE_LIMIT_MAX_MSGS  = 10   // max messages per minute per user

// ── In-memory rate limit store (resets on function cold start) ────────────
const rateLimitStore = {}

function checkRateLimit(userId) {
  const now = Date.now()
  if (!rateLimitStore[userId]) rateLimitStore[userId] = { count: 0, windowStart: now }
  const entry = rateLimitStore[userId]
  if (now - entry.windowStart > RATE_LIMIT_WINDOW_MS) {
    entry.count = 0
    entry.windowStart = now
  }
  entry.count++
  return entry.count <= RATE_LIMIT_MAX_MSGS
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { messages, userId, conversationId } = body

  if (!messages || !Array.isArray(messages) || !userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) }
  }

  // ── Rate limit check (per minute) ─────────────────────────────────────
  if (!checkRateLimit(userId)) {
    return {
      statusCode: 429,
      body: JSON.stringify({ error: 'Too many messages. Please wait a moment before sending again.' })
    }
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // ── Check user credits and daily limits ───────────────────────────────
  try {
    const { data: profile } = await supabase
      .from('profiles')
      .select('credits, plan')
      .eq('id', userId)
      .single()

    if (!profile) return { statusCode: 403, body: JSON.stringify({ error: 'User not found' }) }
    if (profile.credits <= 0) return { statusCode: 402, body: JSON.stringify({ error: 'No credits remaining. Please top up to continue.' }) }

    // Check daily limits
    const { data: usage } = await supabase.rpc('get_daily_usage', { p_user_id: userId })
    const todayCredits  = usage?.[0]?.daily_credits  || 0
    const todayMessages = usage?.[0]?.daily_messages || 0

    if (todayCredits >= DAILY_CREDIT_LIMIT) {
      return { statusCode: 429, body: JSON.stringify({ error: `Daily limit reached (${DAILY_CREDIT_LIMIT} credits/day). Resets at midnight. Upgrade your plan for higher limits.` }) }
    }
    if (todayMessages >= DAILY_MESSAGE_LIMIT) {
      return { statusCode: 429, body: JSON.stringify({ error: `Daily message limit reached (${DAILY_MESSAGE_LIMIT} messages/day). Resets at midnight.` }) }
    }
  } catch (err) {
    console.error('Pre-flight check error:', err)
  }

  // ── Call Anthropic ─────────────────────────────────────────────────────
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   messages.slice(-20)
    })

    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    // ── Calculate credit cost ──────────────────────────────────────────
    const words      = reply.trim().split(/\s+/).length
    const codeBlocks = (reply.match(/```[\s\S]*?```/g) || [])
    const codeLines  = codeBlocks.reduce((s, b) => s + b.split('\n').length, 0)
    let cost = 1
    if (codeLines > 30)  cost = 4
    else if (codeLines > 5) cost = 3
    else if (words > 300) cost = 4
    else if (words > 150) cost = 3
    else if (words > 60)  cost = 2

    // ── Deduct credits and track daily usage ───────────────────────────
    await supabase.rpc('deduct_credits', { user_id: userId, amount: cost })
    await supabase.rpc('track_daily_usage', { p_user_id: userId, p_credits: cost })

    // ── Log transaction ────────────────────────────────────────────────
    await supabase.from('transactions').insert({
      user_id:       userId,
      type:          'usage',
      credits_delta: -cost,
      description:   'AI message'
    })

    // ── Save message to conversation if conversationId provided ────────
    if (conversationId) {
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
      if (lastUserMsg) {
        await supabase.from('messages').insert([
          { conversation_id: conversationId, user_id: userId, role: 'user',      content: lastUserMsg.content, credits_used: 0 },
          { conversation_id: conversationId, user_id: userId, role: 'assistant', content: reply, credits_used: cost }
        ])
        // Update conversation updated_at
        await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', conversationId)
      }
    }

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply, creditCost: cost })
    }
  } catch (err) {
    console.error('Anthropic API error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'AI service error. Please try again.' }) }
  }
}
