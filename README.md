# Airom

A Claude-powered AI chat platform with email auth, credit-based plans, and Stripe billing.

**Stack:** React + Vite · Netlify (hosting + serverless functions) · Supabase (auth + database) · Stripe (payments) · Anthropic API (AI)

---

## Project structure

```
airom/
├── netlify/
│   └── functions/
│       ├── chat.js                  ← AI proxy (keeps Anthropic key server-side)
│       ├── create-checkout.js       ← Creates Stripe checkout sessions
│       └── stripe-webhook.js        ← Handles Stripe payment events
├── src/
│   ├── lib/
│   │   ├── supabase.js              ← Supabase client
│   │   ├── AuthContext.jsx          ← Auth state (session, profile, credits)
│   │   └── plans.js                 ← Plan/credit config (single source of truth)
│   ├── pages/
│   │   ├── SignUp.jsx
│   │   ├── Login.jsx
│   │   ├── Verify.jsx               ← OTP email verification
│   │   ├── Plans.jsx                ← Pricing + Stripe checkout
│   │   └── Chat.jsx                 ← Main AI chat interface
│   ├── styles/
│   │   └── global.css
│   ├── App.jsx                      ← Router + protected routes
│   └── main.jsx
├── supabase/
│   └── migrations/
│       ├── 001_initial_schema.sql   ← Tables, RLS, triggers
│       └── 002_rpc_functions.sql    ← Atomic credit operations
├── .env.example                     ← Copy to .env.local
├── netlify.toml
├── vite.config.js
└── package.json
```

---

## Step-by-step setup

### 1. GitHub

```bash
# Create a new repo on github.com, then:
git init
git remote add origin https://github.com/YOUR_USERNAME/airom.git
git add .
git commit -m "Initial commit"
git push -u origin main
```

---

### 2. Supabase

1. Go to [supabase.com](https://supabase.com) → New project
2. Note your **Project URL** and **anon key** from Settings → API
3. Also copy the **service_role key** (keep this secret — server only)
4. Go to **SQL Editor** and run both migration files in order:
   - `supabase/migrations/001_initial_schema.sql`
   - `supabase/migrations/002_rpc_functions.sql`
5. Go to **Authentication → Email** and ensure:
   - "Enable Email OTP" is turned ON
   - Set "OTP Expiry" to 600 seconds (10 min)
   - Set the sender name to **Airom**
   - Set the sender email to **noreply@airom.ai** (or your verified domain)
6. Under **Authentication → URL Configuration**, add your Netlify URL to allowed redirect URLs once you have it

---

### 3. Stripe

1. Go to [dashboard.stripe.com](https://dashboard.stripe.com)
2. Create 4 products with monthly **recurring** prices:
   | Product     | Price   | Billing  |
   |-------------|---------|----------|
   | Basic Plan  | $9.00   | Monthly  |
   | Pro Plan    | $20.00  | Monthly  |
   | Max Plan    | $45.00  | Monthly  |

3. Create 3 products with **one-time** prices:
   | Product        | Price   |
   |----------------|---------|
   | Top-up 50 cr   | $2.50   |
   | Top-up 150 cr  | $6.00   |
   | Top-up 400 cr  | $14.00  |

4. Copy each **Price ID** (starts with `price_...`) — you'll need them for env vars
5. Go to **Developers → Webhooks** → Add endpoint:
   - URL: `https://YOUR-SITE.netlify.app/.netlify/functions/stripe-webhook`
   - Events to listen for:
     - `checkout.session.completed`
     - `customer.subscription.created`
     - `customer.subscription.deleted`
     - `invoice.payment_succeeded`
6. Copy the **Webhook signing secret** (`whsec_...`)

---

### 4. Netlify

1. Go to [netlify.com](https://netlify.com) → Add new site → Import from GitHub
2. Select your `airom` repo
3. Build settings are auto-detected from `netlify.toml`:
   - Build command: `npm run build`
   - Publish directory: `dist`
4. Go to **Site Settings → Environment Variables** and add ALL of these:

```
VITE_SUPABASE_URL            = https://xxxx.supabase.co
VITE_SUPABASE_ANON_KEY       = eyJ...
SUPABASE_SERVICE_ROLE_KEY    = eyJ...   ← never prefix with VITE_
ANTHROPIC_API_KEY            = sk-ant-...
VITE_STRIPE_PUBLISHABLE_KEY  = pk_live_...
STRIPE_SECRET_KEY            = sk_live_...
STRIPE_WEBHOOK_SECRET        = whsec_...
STRIPE_PRICE_BASIC           = price_...
STRIPE_PRICE_PRO             = price_...
STRIPE_PRICE_MAX             = price_...
STRIPE_PRICE_TOPUP_50        = price_...
STRIPE_PRICE_TOPUP_150       = price_...
STRIPE_PRICE_TOPUP_400       = price_...
```

5. Trigger a deploy — you're live!

---

### 5. Local development

```bash
# Install dependencies
npm install

# Copy env file
cp .env.example .env.local
# Fill in your values in .env.local

# Install Netlify CLI
npm install -g netlify-cli

# Login and link your site
netlify login
netlify link

# Run locally (includes serverless functions)
netlify dev
```

> **Important:** Use `netlify dev` not `npm run dev` — it runs your serverless functions locally so the full auth + AI + Stripe flow works.

---

## Credit system

| Plan    | Price  | Credits/mo |
|---------|--------|-----------|
| Starter | Free   | 20        |
| Basic   | $9/mo  | 200       |
| Pro     | $20/mo | 600       |
| Max     | $45/mo | 1,500     |

| Top-up  | Price  | Credits |
|---------|--------|---------|
| Small   | $2.50  | 50      |
| Medium  | $6.00  | 150     |
| Large   | $14.00 | 400     |

**Credit cost per message:**
- Short response (< 80 words) → **1 credit**
- Medium response (80–250 words) → **2 credits**
- Long response (250+ words) → **4 credits**

---

## User flow

```
Sign up → Email OTP verification → Choose plan → Chat
              ↑                          ↓
           Login              Stripe checkout (paid plans)
                                         ↓
                              Webhook → credits added to DB
```

---

## Security notes

- `ANTHROPIC_API_KEY` and `STRIPE_SECRET_KEY` are **never** sent to the browser
- All AI calls go through `/.netlify/functions/chat` which validates the user exists
- Stripe webhook signature is verified before processing any payment event
- Supabase Row Level Security ensures users can only read their own data
- The `SUPABASE_SERVICE_ROLE_KEY` is only used in serverless functions, never in frontend code

---

## Going to production checklist

- [ ] Switch Stripe from test mode to live mode (update all `pk_`, `sk_`, `price_` keys)
- [ ] Set up a custom domain in Netlify
- [ ] Configure your custom domain email (`noreply@airom.ai`) in Supabase Auth settings
- [ ] Set Supabase Auth redirect URLs to your production domain
- [ ] Update Stripe webhook URL to your production domain
- [ ] Enable Netlify Analytics
- [ ] Set up Sentry or similar for error tracking
