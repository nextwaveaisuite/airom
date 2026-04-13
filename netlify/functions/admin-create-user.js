// netlify/functions/admin-create-user.js
// Creates a new user directly — admin only

const { createClient } = require('@supabase/supabase-js')

const PLAN_CREDITS = { free: 100, basic: 200, pro: 600, max: 1500 }

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) }

  let body
  try { body = JSON.parse(event.body) }
  catch { return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON' }) } }

  const { adminUserId, fullName, email, password, plan } = body

  if (!adminUserId || !email || !password || !fullName) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Missing required fields' }) }
  }

  const supabase = createClient(
    process.env.VITE_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
  )

  // Verify the requester is an admin
  const { data: adminProfile } = await supabase
    .from('profiles')
    .select('is_admin')
    .eq('id', adminUserId)
    .single()

  if (!adminProfile?.is_admin) {
    return { statusCode: 403, body: JSON.stringify({ error: 'Unauthorised — admin access required' }) }
  }

  // Create the user in Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true, // skip email verification
    user_metadata: { full_name: fullName }
  })

  if (authError) {
    return { statusCode: 400, body: JSON.stringify({ error: authError.message }) }
  }

  const newUserId  = authData.user.id
  const credits    = PLAN_CREDITS[plan] || 100

  // Update profile with plan and credits
  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: fullName, plan: plan || 'free', credits })
    .eq('id', newUserId)

  if (profileError) {
    return { statusCode: 500, body: JSON.stringify({ error: 'User created but profile update failed: ' + profileError.message }) }
  }

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ success: true, userId: newUserId, message: `User ${fullName} created successfully` })
  }
}
