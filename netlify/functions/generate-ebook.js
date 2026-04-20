const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Method not allowed' }) }
  }

  let body
  try { body = JSON.parse(event.body) }
  catch (e) { return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { topic, userId } = body

  if (!topic || !userId) {
    return { statusCode: 400, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing topic or userId' }) }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Missing ANTHROPIC_API_KEY' }) }
  }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('credits')
    .eq('id', userId)
    .single()

  if (profileError) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Database error: ' + profileError.message }) }
  }

  if (!profile || profile.credits < 20) {
    return { statusCode: 402, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Not enough credits. eBook costs 20 credits.' }) }
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 4000,
      messages: [{
        role: 'user',
        content: `Write a 5-chapter eBook about: "${topic}". Respond with ONLY a valid JSON object, no markdown, no explanation, no code fences. Structure: {"title":"...","subtitle":"...","description":"...","introduction":"...","chapters":[{"number":1,"title":"...","summary":"...","content":"...","keyPoints":["...","...","..."]}],"conclusion":"..."} Keep each chapter under 150 words.`
      }]
    })

    const raw = response.content[0].text.trim()

    let ebookData
    try {
      ebookData = JSON.parse(raw)
    } catch {
      const match = raw.match(/\{[\s\S]*\}/)
      if (!match) {
        return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'AI returned invalid format. Raw: ' + raw.slice(0, 200) }) }
      }
      ebookData = JSON.parse(match[0])
    }

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
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'eBook failed: ' + err.message })
    }
  }
}
