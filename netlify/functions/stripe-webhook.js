// netlify/functions/stripe-webhook.js
const Stripe = require('stripe')
const { createClient } = require('@supabase/supabase-js')

const PLAN_CREDITS = { basic: 200, pro: 600, max: 1500 }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: 'Method not allowed' }

  const stripe   = new Stripe(process.env.STRIPE_SECRET_KEY)
  const supabase = createClient(process.env.VITE_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY)

  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      event.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature failed:', err.message)
    return { statusCode: 400, body: `Webhook error: ${err.message}` }
  }

  const session = stripeEvent.data.object
  const meta    = session.metadata || {}
  const userId  = meta.userId || session.client_reference_id

  if (!userId) return { statusCode: 200, body: 'OK' }

  try {
    switch (stripeEvent.type) {

      case 'checkout.session.completed': {
        if (session.mode === 'payment') {
          const credits = parseInt(meta.topupCredits, 10) || 0
          if (credits > 0) {
            await supabase.rpc('add_credits', { user_id: userId, amount: credits })
            await supabase.from('transactions').insert({
              user_id: userId, type: 'purchase', credits_delta: credits,
              amount_cents: session.amount_total || 0,
              stripe_session: session.id,
              description: `Top-up: ${credits} credits`
            })
          }
        }
        break
      }

      case 'customer.subscription.created':
      case 'invoice.payment_succeeded': {
        const planKey = meta.planKey
        const credits = PLAN_CREDITS[planKey]
        if (planKey && credits) {
          await supabase.from('profiles').update({ plan: planKey, credits }).eq('id', userId)
          await supabase.from('transactions').insert({
            user_id: userId, type: 'purchase', credits_delta: credits,
            amount_cents: session.amount_paid || 0,
            stripe_session: session.id,
            description: `${planKey} plan — monthly credit refresh`
          })
        }
        break
      }

      case 'customer.subscription.deleted': {
        await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId)
        break
      }

      default:
        console.log(`Unhandled event: ${stripeEvent.type}`)
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return { statusCode: 500, body: 'Internal error' }
  }

  return { statusCode: 200, body: 'OK' }
}
