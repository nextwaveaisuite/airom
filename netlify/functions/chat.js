// netlify/functions/chat.js
// Claude AI proxy with rate limiting, daily credit cap, file support and full memory recall

const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

const SYSTEM_PROMPT = `You are Airom, an exceptionally intelligent AI assistant built for people who want real results.
Your name is Airom - short for AI Rom. You are sharp, warm, proactive, and genuinely helpful.

CORE BEHAVIOUR - always follow these:

1. THINK AHEAD: Before answering, mentally consider what the user is ultimately trying to achieve, not just what they literally asked. Anticipate what they will need next and address it proactively.

2. SPOT PROBLEMS EARLY: If you notice a potential issue, bug, risk, or better approach - mention it before the user runs into it. Do not wait to be asked.

3. CLARIFY WHEN NEEDED: If a request is ambiguous and getting it wrong would waste the user's time, ask one focused clarifying question before proceeding. Never ask multiple questions at once.

4. STRUCTURED THINKING: For complex problems, briefly outline your approach before diving in. This helps the user follow your reasoning and catch misunderstandings early.

5. PROACTIVE NEXT STEPS: At the end of responses - especially for coding, writing, or research tasks - suggest 2-3 natural next steps the user might want. Keep these brief and relevant, formatted as "What next: ..." at the end.

6. CODE QUALITY: Always write production-quality code. Include error handling, comments for complex logic, and mention any dependencies or setup steps needed. Anticipate common bugs and handle them.

7. FILE ANALYSIS: When a user shares a file or image, analyze it thoroughly. Point out anything important, unexpected, or worth flagging - even if they did not explicitly ask about it.

8. HONEST UNCERTAINTY: If you are not certain about something, say so clearly. Offer your best answer while flagging the uncertainty rather than guessing confidently.

9. FULL CONVERSATION MEMORY: You have access to the COMPLETE conversation history from the very beginning of this chat session. When a user asks you to recall something, go back and find it accurately. Reference specific things they said earlier. If asked "do you remember what I said about X" - search the full history and answer precisely. If asked to "go back to the start" - you can reference anything from the very first message. Never say you cannot remember something from earlier in this conversation - you have it all.

10. CONCISE BUT COMPLETE: Be thorough without being verbose. Cut filler words. Every sentence should add value. No unnecessary preamble like "Certainly!" or "Great question!".

Format all code in markdown code blocks with the correct language specified.
When greeting a user for the first time, introduce yourself as Airom warmly and ask what they are working on today.`

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

    // Detect if user is asking to recall conversation history
    const lastUserMsg = messages[messages.length - 1]?.content || ''
    const isMemoryRequest = /remember|recall|earlier|before|previous|back to|what did (i|we|you)|go back|find where|search.*chat|look back|history|start of/i.test(lastUserMsg)

    // Use full history for memory requests, otherwise cap at 40
    const msgLimit  = isMemoryRequest ? messages.length : 40
    const systemMsg = isMemoryRequest
      ? SYSTEM_PROMPT + '\n\nIMPORTANT: The user is asking you to recall something from earlier in this conversation. You have the FULL conversation history available. Search through ALL previous messages carefully and provide a precise, accurate answer referencing the exact point in the conversation where it was discussed.'
      : SYSTEM_PROMPT

    // Build messages array — inject attachments into the last user message
    const msgsToUse = messages.slice(-msgLimit)
    const apiMessages = msgsToUse.map((msg, idx) => {
      const isLast = idx === msgsToUse.length - 1
      if (isLast && msg.role === 'user' && attachments && attachments.length > 0) {
        const content = []
        for (const att of attachments) {
          if (att.type === 'image') {
            content.push({ type: 'image', source: { type: 'base64', media_type: att.mediaType, data: att.data } })
          } else if (att.mediaType === 'application/pdf') {
            content.push({ type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: att.data } })
          } else {
            const decoded = Buffer.from(att.data, 'base64').toString('utf-8')
            content.push({ type: 'text', text: `File: ${att.name}\n\`\`\`\n${decoded.slice(0, 20000)}\n\`\`\`` })
          }
        }
        if (msg.content) content.push({ type: 'text', text: msg.content })
        return { role: 'user', content }
      }
      return { role: msg.role, content: msg.content }
    })

    const response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: isMemoryRequest ? 2000 : 1500,
      system:     systemMsg,
      messages:   apiMessages
    })

    const reply = response.content.filter(b => b.type === 'text').map(b => b.text).join('')

    // Credit cost
    const words      = reply.trim().split(/\s+/).length
    const codeBlocks = (reply.match(/```[\s\S]*?```/g) || [])
    const codeLines  = codeBlocks.reduce((s, b) => s + b.split('\n').length, 0)
    let cost = 1
    if (codeLines > 30)      cost = 4
    else if (codeLines > 5)  cost = 3
    else if (words > 300)    cost = 4
    else if (words > 150)    cost = 3
    else if (words > 60)     cost = 2
    if (attachments && attachments.length > 0) cost = Math.min(cost + 1, 5)

    await supabase.rpc('deduct_credits', { user_id: userId, amount: cost })
    await supabase.rpc('track_daily_usage', { p_user_id: userId, p_credits: cost })
    await supabase.from('transactions').insert({ user_id: userId, type: 'usage', credits_delta: -cost, description: attachments?.length ? 'AI message with file' : 'AI message' })

    // Save to conversation
    try {
      let convId = conversationId
      if (!convId) {
        const firstUserMsg = [...messages].reverse().find(m => m.role === 'user')
        const title = (firstUserMsg?.content || 'New conversation').slice(0, 60)
        const { data: newConv, error: convError } = await supabase.from('conversations').insert({ user_id: userId, title }).select().single()
        if (convError) console.error('Failed to create conversation:', convError)
        else convId = newConv.id
      }
      if (convId) {
        const lastMsg = [...messages].reverse().find(m => m.role === 'user')
        const userContent = attachments?.length
          ? '[File: ' + attachments.map(a => a.name).join(', ') + ']\n' + (lastMsg?.content || '')
          : lastMsg?.content || ''
        await supabase.from('messages').insert([
          { conversation_id: convId, user_id: userId, role: 'user',      content: userContent, credits_used: 0 },
          { conversation_id: convId, user_id: userId, role: 'assistant', content: reply, credits_used: cost }
        ])
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
