// ── Plan definitions ─────────────────────────────────────────────────────────
export const PLANS = {
  free: {
    key: 'free',
    name: 'Starter',
    price: 0,
    credits: 100,
    stripePriceId: null,
    features: ['100 credits to try', 'Full AI responses', 'No card needed'],
    badge: null
  },
  basic: {
    key: 'basic',
    name: 'Basic',
    price: 9,
    credits: 200,
    stripePriceId: import.meta.env.VITE_STRIPE_PRICE_BASIC,
    features: ['200 credits / month', 'Full responses', 'Email support'],
    badge: null
  },
  pro: {
    key: 'pro',
    name: 'Pro',
    price: 20,
    credits: 600,
    stripePriceId: import.meta.env.VITE_STRIPE_PRICE_PRO,
    features: ['600 credits / month', 'Priority responses', 'Top-up any time'],
    badge: 'Most popular'
  },
  max: {
    key: 'max',
    name: 'Max',
    price: 45,
    credits: 1500,
    stripePriceId: import.meta.env.VITE_STRIPE_PRICE_MAX,
    features: ['1,500 credits / month', 'Fastest responses', 'Priority support'],
    badge: null
  }
}

// ── Top-up packs ─────────────────────────────────────────────────────────────
export const TOPUPS = [
  { credits: 50,  price: 2.50,  stripePriceId: import.meta.env.VITE_STRIPE_PRICE_TOPUP_50  },
  { credits: 150, price: 6.00,  stripePriceId: import.meta.env.VITE_STRIPE_PRICE_TOPUP_150 },
  { credits: 400, price: 14.00, stripePriceId: import.meta.env.VITE_STRIPE_PRICE_TOPUP_400 }
]

// ── Credit cost per action ────────────────────────────────────────────────────
// Detects code generation, response length, and complexity
export function calcCreditCost(responseText = '') {
  const words = responseText.trim().split(/\s+/).length

  // Code generation — look for code blocks
  const codeBlocks = (responseText.match(/```[\s\S]*?```/g) || [])
  const codeLines  = codeBlocks.reduce((sum, block) => sum + block.split('\n').length, 0)

  if (codeLines > 30)  return 4  // Large code generation
  if (codeLines > 5)   return 3  // Medium code generation / complex response
  if (words > 300)     return 4  // Long / complex response
  if (words > 150)     return 3  // Medium-long response
  if (words > 60)      return 2  // Medium message
  return 1                       // Short message (< ~200 words equivalent)
}

// Credit cost breakdown (shown in UI)
export const CREDIT_COSTS = [
  { label: 'Short message',            range: '< 200 words',   cost: '1 credit'   },
  { label: 'Medium message',           range: '200–300 words', cost: '2 credits'  },
  { label: 'Long / complex response',  range: '300+ words',    cost: '3–5 credits'},
  { label: 'Code generation',          range: 'any length',    cost: '2–4 credits'}
]

// ── Helpers ───────────────────────────────────────────────────────────────────
export const LOW_CREDIT_THRESHOLD = 20
