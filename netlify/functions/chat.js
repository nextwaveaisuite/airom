// netlify/functions/chat.js
// Claude AI proxy with rate limiting, daily credit cap, and file support

const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `You are Airom, a powerful and intelligent AI assistant built for people who want real results.
Your name is Airom — short for AI Rom — and you are sharp, warm, and genuinely helpful.
You assist with coding, writing, analysis, research, math, brainstorming, and everyday questions.
When a user shares a file or image, analyze it thoroughly and provide detailed, useful insights.
You give clear, focused answers and never pad responses with unnecessary filler.
Format all code in markdown code blocks with the correct language specified.
When greeting a user for the first time, introduce yourself as Airom warmly and briefly mention what you can help with.`

const DAILY_CREDIT_LIMIT  = 150
const DAILY_MESSAGE_LIMIT = 80
const RATE_LIMIT_WINDOW   = 60 * 1000
const RATE_LIMIT_MAX      = 10

const rateLimitStore = {}

function checkRateLimit(userId) {
  const now = Date.now()
  if (!rateLimitStore[userId]) rateLimitStore[userId] = { count: 0, windowStart: now }
  const e = rateLimitStore[userId]
  if (now - e.windowStart > RATE_LIMIT_WINDOW) { e.count = 0; e.windowStart = now }
  e.count++
  return e.count <= RATE_LIMIT_MAX
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { messages, userId, conversationId, attachments } = body

  if (!messages || !Array.isArray(messages) || !userId) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) }
  }

  if (!checkRateLimit(userId)) {
    return { statusCode: 429, body: JSON.stringify({ error: 'Too many messages. Please wait a moment before sending again.' }) }
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  try {
    const { data: profile } = await supabase.from('profiles').select('credits, plan').eq('id', userId).single()
    if (!profile) return { statusCode: 403, body: JSON.stringify({ error: 'User not found' }) }
    if (profile.credits <= 0) return { statusCode: 402, body: JSON.stringify({ error: 'No credits remaining. Please top up to continue.' }) }

    const { data: usage } = await supabase.rpc('get_daily_usage', { p_user_id: userId })
    const todayCredits  = usage?.[0]?.daily_credits  || 0
    const todayMessages = usage?.[0]?.daily_messages || 0

    if (todayCredits  >= DAILY_CREDIT_LIMIT)  return { statusCode: 429, body: JSON.stringify({ error: `Daily limit reached (${DAILY_CREDIT_LIMIT} credits/day). Resets at midnight.` }) }
    if (todayMessages >= DAILY_MESSAGE_LIMIT) return { statusCode: 429, body: JSON.stringify({ error: `Daily message limit reached (${DAILY_MESSAGE_LIMIT}/day). Resets at midnight.` }) }
  } catch (err) {
    console.error('Pre-flight check error:', err)
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Build messages array — inject attachments into the last user message
    const apiMessages = messages.slice(-20).map((msg, idx) => {
      const isLast = idx === messages.slice(-20).length - 1

      // If this is the last user message and we have attachments, build content array
      if (isLast && msg.role === 'user' && attachments && attachments.length > 0) {
        const content = []

        // Add each attachment
        for (const att of attachments) {
          if (att.type === 'image') {
            content.push({
              type: 'image',
              source: { type: 'base64', media_type: att.mediaType, data: att.data }
            })
          } else if (att.type === 'document') {
            // For PDFs send as document, for text files inline as text
            if (att.mediaType === 'application/pdf') {
              content.push({
                type: 'document',
                source: { type: 'base64', media_type: 'application/pdf', data: att.data }
              })
            } else {
              // Plain text files — decode base64 and send as text block
              const decoded = Buffer.from(att.data, 'base64').toString('utf-8')
              content.push({
                type: 'text',
                text: `📎 File: ${att.name}\n\`\`\`\n${decoded.slice(0, 20000)}\n\`\`\``
              })
            }
          }
        }

        // Add the text message after attachments
        if (msg.content) content.push({ type: 'text', text: msg.content })

        return { role: 'user', content }
      }

      return { role: msg.role, content: msg.content }
    })

    const response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1500,
      system:     SYSTEM_PROMPT,
      messages:   apiMessages
    })

    const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('')

    // Credit cost — files cost +1 extra credit
    const words      = reply.trim().split(/\s+/).length
    const codeBlocks = (reply.match(/```[\s\S]*?```/g) || [])
    const codeLines  = codeBlocks.reduce((s, b) => s + b.split('\n').length, 0)
    let cost = 1
    if (codeLines > 30)  cost = 4
    else if (codeLines > 5)  cost = 3
    else if (words > 300) cost = 4
    else if (words > 150) cost = 3
    else if (words > 60)  cost = 2
    if (attachments && attachments.length > 0) cost = Math.min(cost + 1, 5)

    await supabase.rpc('deduct_credits', { user_id: userId, amount: cost })
    await supabase.rpc('track_daily_usage', { p_user_id: userId, p_credits: cost })
    await supabase.from('transactions').insert({ user_id: userId, type: 'usage', credits_delta: -cost, description: attachments?.length ? 'AI message with file' : 'AI message' })

    // Save to conversation — create one server-side if no ID provided
    try {
      let convId = conversationId
      if (!convId) {
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
        const title = (lastUserMsg?.content || 'New conversation').slice(0, 60)
        const { data: newConv, error: convError } = await supabase
          .from('conversations')
          .insert({ user_id: userId, title })
          .select()
          .single()
        if (convError) console.error('Failed to create conversation:', convError)
        else convId = newConv.id
      }
      if (convId) {
        const lastUserMsg = [...messages].reverse().find(m => m.role === 'user')
        const userContent = attachments?.length
          ? '[File: ' + attachments.map(a => a.name).join(', ') + ']\n' + (lastUserMsg?.content || '')
          : lastUserMsg?.content || ''
        const { error: msgError } = await supabase.from('messages').insert([
          { conversation_id: convId, user_id: userId, role: 'user',      content: userContent, credits_used: 0 },
          { conversation_id: convId, user_id: userId, role: 'assistant', content: reply, credits_used: cost }
        ])
        if (msgError) console.error('Failed to save messages:', msgError)
        await supabase.from('conversations').update({ updated_at: new Date().toISOString() }).eq('id', convId)
      }
    } catch (saveErr) {
      console.error('Conversation save error:', saveErr)
    }

    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ reply, creditCost: cost }) }
  } catch (err) {
    console.error('Anthropic API error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: 'AI service error. Please try again.' }) }
  }
}
