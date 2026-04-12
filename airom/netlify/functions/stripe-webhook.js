// netlify/functions/stripe-webhook.js
// Receives Stripe events and updates user credits/plan in Supabase
// Must be configured as the webhook endpoint in your Stripe dashboard:
//   https://your-site.netlify.app/.netlify/functions/stripe-webhook

const Stripe = require('stripe')
const { createClient } = require('@supabase/supabase-js')

// Plan credit amounts (monthly refresh on billing)
const PLAN_CREDITS = {
  basic: 200,
  pro:   600,
  max:   1500
}

// Free plan starting credits (set once on signup via DB default, not here)
const FREE_CREDITS = 100

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method not allowed' }
  }

  const stripe    = new Stripe(process.env.STRIPE_SECRET_KEY)
  const supabase  = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Verify the webhook signature to confirm it's from Stripe
  let stripeEvent
  try {
    stripeEvent = stripe.webhooks.constructEvent(
      event.body,
      event.headers['stripe-signature'],
      process.env.STRIPE_WEBHOOK_SECRET
    )
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message)
    return { statusCode: 400, body: `Webhook error: ${err.message}` }
  }

  const session  = stripeEvent.data.object
  const meta     = session.metadata || {}
  const userId   = meta.userId || session.client_reference_id

  if (!userId) {
    console.error('No userId in webhook metadata')
    return { statusCode: 200, body: 'OK' } // return 200 to stop Stripe retrying
  }

  try {
    switch (stripeEvent.type) {

      // ── One-time top-up payment completed ─────────────────────────────────
      case 'checkout.session.completed': {
        if (session.mode === 'payment') {
          const credits = parseInt(meta.topupCredits, 10) || 0
          if (credits > 0) {
            // Add credits to existing balance
            await supabase.rpc('add_credits', { user_id: userId, amount: credits })

            // Log the transaction
            await supabase.from('transactions').insert({
              user_id:         userId,
              type:            'purchase',
              credits_delta:   credits,
              amount_cents:    session.amount_total || 0,
              stripe_session:  session.id,
              description:     `Top-up: ${credits} credits`
            })
          }
        }
        break
      }

      // ── New subscription started ───────────────────────────────────────────
      case 'customer.subscription.created':
      case 'invoice.payment_succeeded': {
        const planKey = meta.planKey
        const credits = PLAN_CREDITS[planKey]
        if (planKey && credits) {
          // Set plan and refresh credits to monthly allowance
          await supabase
            .from('profiles')
            .update({ plan: planKey, credits })
            .eq('id', userId)

          await supabase.from('transactions').insert({
            user_id:        userId,
            type:           'purchase',
            credits_delta:  credits,
            amount_cents:   session.amount_paid || 0,
            stripe_session: session.id,
            description:    `${planKey} plan — monthly credit refresh`
          })
        }
        break
      }

      // ── Subscription cancelled ─────────────────────────────────────────────
      case 'customer.subscription.deleted': {
        await supabase
          .from('profiles')
          .update({ plan: 'free' })
          .eq('id', userId)
        break
      }

      default:
        // Unhandled event — log it but return 200
        console.log(`Unhandled Stripe event: ${stripeEvent.type}`)
    }
  } catch (err) {
    console.error('Webhook handler error:', err)
    return { statusCode: 500, body: 'Internal error' }
  }

  return { statusCode: 200, body: 'OK' }
}
