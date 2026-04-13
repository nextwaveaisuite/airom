// netlify/functions/stripe-webhook.js
const Stripe = require('stripe')
const { createClient } = require('@supabase/supabase-js')

const PLAN_CREDITS = { basic: 200, pro: 600, max: 1500 }

const PRICE_TO_PLAN = {
  [process.env.STRIPE_PRICE_BASIC]: 'basic',
  [process.env.STRIPE_PRICE_PRO]:   'pro',
  [process.env.STRIPE_PRICE_MAX]:   'max'
}

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

  const obj    = stripeEvent.data.object
  const meta   = obj.metadata || {}

  // Helper: find user by email
  async function getUserByEmail(email) {
    if (!email) return null
    const { data } = await supabase
      .from('profiles')
      .select('id, plan, credits')
      .eq('id', (await supabase.auth.admin.getUserByEmail(email))?.data?.user?.id)
      .single()
    return data
  }

  // Helper: find user ID by email via auth
  async function getUserIdByEmail(email) {
    if (!email) return null
    try {
      const { data } = await supabase.auth.admin.getUserByEmail(email)
      return data?.user?.id || null
    } catch { return null }
  }

  // Helper: find plan from line items price ID
  function getPlanFromPriceId(priceId) {
    return PRICE_TO_PLAN[priceId] || null
  }

  try {
    switch (stripeEvent.type) {

      // ── Checkout completed ───────────────────────────────────────────────
      case 'checkout.session.completed': {
        const session = obj
        const email   = session.customer_email || session.customer_details?.email
        const userId  = meta.userId || await getUserIdByEmail(email)

        if (session.mode === 'payment') {
          // One-time top-up
          const credits = parseInt(meta.topupCredits, 10) || 0
          if (credits > 0 && userId) {
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

      // ── Invoice paid (subscription renewed or created) ───────────────────
      case 'invoice.payment_succeeded': {
        const invoice = obj
        const email   = invoice.customer_email
        const userId  = await getUserIdByEmail(email)

        if (!userId) { console.error('No user found for email:', email); break }

        // Get plan from line items
        let planKey = null
        const lines = invoice.lines?.data || []
        for (const line of lines) {
          const priceId = line.pricing?.price_details?.price || line.price?.id
          if (priceId && PRICE_TO_PLAN[priceId]) {
            planKey = PRICE_TO_PLAN[priceId]
            break
          }
        }

        if (planKey) {
          const credits = PLAN_CREDITS[planKey]
          await supabase.from('profiles').update({ plan: planKey, credits }).eq('id', userId)
          await supabase.from('transactions').insert({
            user_id: userId, type: 'purchase', credits_delta: credits,
            amount_cents: invoice.amount_paid || 0,
            stripe_session: invoice.id,
            description: `${planKey} plan — monthly credit refresh`
          })
          console.log(`Upgraded ${email} to ${planKey} with ${credits} credits`)
        }
        break
      }

      // ── Subscription cancelled ───────────────────────────────────────────
      case 'customer.subscription.deleted': {
        const sub   = obj
        const email = sub.customer_email
        const userId = await getUserIdByEmail(email)
        if (userId) {
          await supabase.from('profiles').update({ plan: 'free' }).eq('id', userId)
          console.log(`Downgraded ${email} to free plan`)
        }
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
