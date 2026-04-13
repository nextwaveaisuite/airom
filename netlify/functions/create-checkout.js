// netlify/functions/create-checkout.js
const Stripe = require('stripe')

const TOPUP_CREDITS = {
  [process.env.STRIPE_PRICE_TOPUP_50]:  50,
  [process.env.STRIPE_PRICE_TOPUP_150]: 150,
  [process.env.STRIPE_PRICE_TOPUP_400]: 400
}

const PLAN_KEYS = {
  [process.env.STRIPE_PRICE_BASIC]: 'basic',
  [process.env.STRIPE_PRICE_PRO]:   'pro',
  [process.env.STRIPE_PRICE_MAX]:   'max'
}

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { priceId, mode, userId, email } = body
  if (!priceId || !mode || !userId || !email) return { statusCode: 400, body: JSON.stringify({ error: 'Missing fields' }) }

  const stripe  = new Stripe(process.env.STRIPE_SECRET_KEY)
  const baseUrl = process.env.URL || 'https://airom.netlify.app'

  try {
    const session = await stripe.checkout.sessions.create({
      mode,
      line_items: [{ price: priceId, quantity: 1 }],
      customer_email: email,
      client_reference_id: userId,
      metadata: {
        userId,
        priceId,
        mode,
        planKey:      PLAN_KEYS[priceId]     || '',
        topupCredits: TOPUP_CREDITS[priceId] || 0
      },
      success_url: `${baseUrl}/chat?success=true`,
      cancel_url:  `${baseUrl}/plans?cancelled=true`,
      billing_address_collection: 'auto',
      allow_promotion_codes: true
    })
    return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ url: session.url }) }
  } catch (err) {
    console.error('Stripe error:', err)
    return { statusCode: 500, body: JSON.stringify({ error: err.message }) }
  }
}
