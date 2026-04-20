// netlify/functions/generate-image.js
// Generates images using OpenAI DALL-E 3

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { prompt, userId, size = '1024x1024', quality = 'standard' } = body

  if (!prompt || !userId) return { statusCode: 400, body: JSON.stringify({ error: 'Missing prompt or userId' }) }

  if (!process.env.OPENAI_API_KEY) {
    return { statusCode: 503, body: JSON.stringify({ error: 'Image generation not configured. Please add OPENAI_API_KEY to Netlify environment variables.' }) }
  }

  const { createClient } = require('@supabase/supabase-js')
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  const { data: profile } = await supabase.from('profiles').select('credits').eq('id', userId).single()
  if (!profile || profile.credits < 5) {
    return { statusCode: 402, body: JSON.stringify({ error: 'Not enough credits. Image generation costs 5 credits.' }) }
  }

  try {
    const response = await fetch('https://api.openai.com/v1/images/generations', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.OPENAI_API_KEY}` },
      body: JSON.stringify({ model: 'dall-e-3', prompt, n: 1, size, quality, response_format: 'url' })
    })

    const data = await response.json()
    if (!response.ok) throw new Error(data.error?.message || 'Image generation failed')

    const imageUrl      = data.data[0].url
    const revisedPrompt = data.data[0].revised_prompt

    await supabase.rpc('deduct_credits', { user_id: userId, amount: 5 })
    await supabase.from('transactions').insert({ user_id: userId, type: 'usage', credits_delta: -5, description: 'Image generation' })

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ imageUrl, revisedPrompt, creditCost: 5 })
    }
  } catch (err) {
    console.error('Image generation error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
