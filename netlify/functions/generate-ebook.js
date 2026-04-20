// netlify/functions/generate-ebook.js
const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) }
  catch (e) { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON: ' + e.message }) } }

  const { topic, userId } = body
  console.log('eBook request - topic:', topic, 'userId:', userId)

  if (!topic || !userId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing topic or userId' }) }

  // Check environment variables
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('ANTHROPIC_API_KEY is missing')
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: missing API key' }) }
  }
  if (!process.env.VITE_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    console.error('Supabase env vars missing')
    return { statusCode: 500, body: JSON.stringify({ error: 'Server configuration error: missing database config' }) }
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  // Check credits
  const { data: profile, error: profileError } = await supabase.from('profiles').select('credits').eq('id', userId).single()
  console.log('Profile fetch:', profile, 'Error:', profileError)

  if (profileError) return { statusCode: 500, body: JSON.stringify({ error: 'Database error: ' + profileError.message }) }
  if (!profile || profile.credits < 20) {
    return { statusCode: 402, body: JSON.stringify({ error: 'Not enough credits. eBook generation costs 20 credits.' }) }
  }

  try {
    console.log('Calling Anthropic API...')
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Write a 5-chapter eBook about: "${topic}"

Respond with ONLY valid JSON, no other text. Use this exact structure:
{"title":"...","subtitle":"...","description":"...","introduction":"...","chapters":[{"number":1,"title":"...","summary":"...","content":"...","keyPoints":["...","...","..."]}],"conclusion":"..."}

Keep each chapter content to 150 words maximum.`
      }]
    })

    console.log('Anthropic response received, content blocks:', response.content.length)
    const text = response.content[0].text.trim()
    console.log('Response preview:', text.slice(0, 200))

    // Parse JSON
    let ebookData
    try {
      ebookData = JSON.parse(text)
    } catch (parseErr) {
      console.error('JSON parse failed:', parseErr.message)
      console.error('Full text:', text.slice(0, 1000))
      // Try extracting JSON
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) {
        return { statusCode: 500, body: JSON.stringify({ error: 'AI returned invalid format. Please try again.' }) }
      }
      try {
        ebookData = JSON.parse(match[0])
      } catch (e2) {
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse eBook: ' + e2.message }) }
      }
    }

    console.log('eBook parsed successfully, title:', ebookData.title)

    // Deduct credits
    const { error: deductError } = await supabase.rpc('deduct_credits', { user_id: userId, amount: 20 })
    if (deductError) console.error('Credit deduction error:', deductError)

    await supabase.from('transactions').insert({
      user_id: userId, type: 'usage', credits_delta: -20, description: `eBook: ${topic}`
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ebook: ebookData, creditCost: 20 })
    }
  } catch (err) {
    console.error('eBook generation error:', err.message, err.stack)
    return { statusCode: 500, body: JSON.stringify({ error: 'eBook failed: ' + err.message }) }
  }
}
