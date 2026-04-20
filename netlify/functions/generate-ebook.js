// netlify/functions/generate-ebook.js
// Generates structured eBook content using Claude

const Anthropic = require('@anthropic-ai/sdk')
const { createClient } = require('@supabase/supabase-js')

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { topic, chapters = 5, audience = 'general', userId } = body
  if (!topic || !userId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing topic or userId' }) }

  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).single()
  if (!profile || profile.credits < 20) {
    return { statusCode: 402, body: JSON.stringify({ error: 'Not enough credits. eBook generation costs 20 credits.' }) }
  }

  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

    const prompt = `Create a comprehensive, well-structured eBook about: "${topic}"

Target audience: ${audience}
Number of chapters: ${chapters}

Please structure your response as valid JSON with this exact format:
{
  "title": "Full eBook Title",
  "subtitle": "Compelling subtitle",
  "author": "Airom AI",
  "description": "2-3 sentence description of the eBook",
  "introduction": "Engaging introduction paragraph that hooks the reader",
  "chapters": [
    {
      "number": 1,
      "title": "Chapter Title",
      "summary": "One sentence summary",
      "content": "Full chapter content with multiple paragraphs. Aim for 400-600 words per chapter.",
      "keyPoints": ["Key point 1", "Key point 2", "Key point 3"]
    }
  ],
  "conclusion": "Compelling conclusion paragraph"
}

Make the content engaging, informative, and professional. Each chapter should flow naturally into the next.`

    const response = await client.messages.create({
      model:     'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages:  [{ role: 'user', content: prompt }]
    })

    const text      = response.content[0].text
    const jsonMatch = text.match(/\{[\s\S]*\}/)
    if (!jsonMatch) throw new Error('Failed to generate structured eBook content')

    const ebookData = JSON.parse(jsonMatch[0])

    await supabase.rpc('deduct_credits', { user_id: userId, amount: 20 })
    await supabase.from('transactions').insert({ user_id: userId, type: 'usage', credits_delta: -20, description: `eBook: ${topic}` })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ebook: ebookData, creditCost: 20 })
    }
  } catch (err) {
    console.error('eBook generation error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
