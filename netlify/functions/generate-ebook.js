// netlify/functions/generate-ebook.js
const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { topic, userId } = body
  if (!topic || !userId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing topic or userId' }) }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).single()
  if (!profile || profile.credits < 20) {
    return { statusCode: 402, body: JSON.stringify({ error: 'Not enough credits. eBook generation costs 20 credits.' }) }
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    // Faster: ask for shorter chapters, strict JSON only
    const response = await client.messages.create({
      model:      'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Write a 5-chapter eBook about: "${topic}"

Respond with ONLY valid JSON, no other text, no markdown, no explanation. Use this exact structure:
{"title":"...","subtitle":"...","description":"...","introduction":"...","chapters":[{"number":1,"title":"...","summary":"...","content":"...","keyPoints":["...","...","..."]}],"conclusion":"..."}

Keep each chapter content to 200 words maximum. Be concise and practical.`
      }]
    })

    const text = response.content[0].text.trim()

    // Try to parse JSON - handle cases where model adds extra text
    let ebookData
    try {
      ebookData = JSON.parse(text)
    } catch {
      // Try to extract JSON if wrapped in other text
      const match = text.match(/\{[\s\S]*\}/)
      if (!match) {
        console.error('Raw response:', text.slice(0, 500))
        return { statusCode: 500, body: JSON.stringify({ error: 'Failed to parse eBook structure. Please try again.' }) }
      }
      ebookData = JSON.parse(match[0])
    }

    // Deduct credits
    await supabase.rpc('deduct_credits', { user_id: userId, amount: 20 })
    await supabase.from('transactions').insert({
      user_id: userId, type: 'usage', credits_delta: -20, description: `eBook: ${topic}`
    })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ebook: ebookData, creditCost: 20 })
    }
  } catch (err) {
    console.error('eBook error:', err.message)
    return { statusCode: 500, body: JSON.stringify({ error: 'eBook generation failed: ' + err.message }) }
  }
}
