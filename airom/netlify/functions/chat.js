// netlify/functions/chat.js
// Proxies requests to Anthropic API — API key never touches the browser

const Anthropic = require('@anthropic-ai/sdk')

const SYSTEM_PROMPT = `You are Airom, a powerful and intelligent AI assistant built for people who want real results.
Your name is Airom — short for AI Rom — and you are sharp, warm, and genuinely helpful.
You assist with coding, writing, analysis, research, math, brainstorming, and everyday questions.
You give clear, focused answers and never pad responses with unnecessary filler.
Format all code in markdown code blocks with the correct language specified.
When greeting a user for the first time, introduce yourself as Airom warmly and briefly mention what you can help with.`

exports.handler = async (event) => {
  // Only allow POST
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body
  try {
    body = JSON.parse(event.body)
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) }
  }

  const { messages, userId } = body

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return { statusCode: 400, body: JSON.stringify({ error: 'messages array is required' }) }
  }

  if (!userId) {
    return { statusCode: 401, body: JSON.stringify({ error: 'Unauthorized' }) }
  }

  // Verify user has credits (via Supabase service role)
  try {
    const { createClient } = require('@supabase/supabase-js')
    const supabase = createClient(
      process.env.VITE_SUPABASE_URL,
      process.env.SUPABASE_SERVICE_ROLE_KEY // service role — never expose to browser
    )

    const { data: profile, error } = await supabase
      .from('profiles')
      .select('credits')
      .eq('id', userId)
      .single()

    if (error || !profile) {
      return { statusCode: 403, body: JSON.stringify({ error: 'User not found' }) }
    }

    if (profile.credits <= 0) {
      return { statusCode: 402, body: JSON.stringify({ error: 'Insufficient credits' }) }
    }
  } catch (err) {
    console.error('Supabase credit check failed:', err)
    // Proceed anyway to avoid blocking users on DB errors
  }

  // Call Anthropic
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 1024,
      system:     SYSTEM_PROMPT,
      messages:   messages.slice(-20) // cap history at 20 turns to control costs
    })

    const reply = response.content
      .filter(b => b.type === 'text')
      .map(b => b.text)
      .join('')

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply })
    }
  } catch (err) {
    console.error('Anthropic API error:', err)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: 'AI service error. Please try again.' })
    }
  }
}
