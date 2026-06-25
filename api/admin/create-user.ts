import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, requireAdmin, supabaseAdmin } from '../_lib/supabase.js'

function generateTempPassword(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789!@#$'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return }

  const auth = await authenticate(req)
  const denied = requireAdmin(auth)
  if (denied) { res.status(denied.status).json({ error: denied.message }); return }

  const { email, password, phoneCredits, emailCredits, unlimited } = req.body as {
    email?: string; password?: string
    phoneCredits?: number; emailCredits?: number; unlimited?: boolean
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    res.status(400).json({ error: 'Email invalide' }); return
  }

  const tempPassword  = password?.trim() || generateTempPassword()
  const phoneCr       = Math.max(0, parseInt(String(phoneCredits ?? 0), 10))
  const emailCr       = Math.max(0, parseInt(String(emailCredits ?? 0), 10))
  const isUnlimited   = !!unlimited

  // 1. Créer l'utilisateur dans auth.users (confirmé immédiatement)
  const { data: authData, error: authError } = await supabaseAdmin.auth.admin.createUser({
    email,
    password: tempPassword,
    email_confirm: true,
  })
  if (authError) { res.status(400).json({ error: authError.message }); return }
  const userId = authData.user.id

  // 2. Créer une organisation synthétique (SIREN unique pour comptes créés manuellement)
  const fakeSiren = `MAN${crypto.randomUUID().replace(/-/g, '').slice(0, 9).toUpperCase()}`
  const { data: org, error: orgError } = await supabaseAdmin
    .from('organizations')
    .insert({ siren: fakeSiren, legal_name: email.split('@')[0] })
    .select()
    .single()

  if (orgError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    res.status(500).json({ error: `Erreur organisation : ${orgError.message}` }); return
  }

  // 3. Créer ou mettre à jour le profil (le trigger Supabase peut en avoir déjà créé un)
  const { error: profileError } = await supabaseAdmin.from('profiles').upsert({
    id: userId,
    organization_id: org.id,
    professional_email: email,
    first_name: '',
    last_name: '',
    role: 'agent',
    access_status: 'approved',
  }, { onConflict: 'id' })

  if (profileError) {
    await supabaseAdmin.auth.admin.deleteUser(userId)
    await supabaseAdmin.from('organizations').delete().eq('id', org.id)
    res.status(500).json({ error: `Erreur profil : ${profileError.message}` }); return
  }

  // 4. Allouer les crédits
  const { error: creditsError } = await supabaseAdmin.from('credit_balances').insert({
    organization_id: org.id,
    phone_credits:   isUnlimited ? 0 : phoneCr,
    email_credits:   isUnlimited ? 0 : emailCr,
    unlimited:       isUnlimited,
  })

  if (creditsError) {
    res.status(500).json({ error: `Erreur crédits : ${creditsError.message}` }); return
  }

  await supabaseAdmin.from('audit_logs').insert({
    actor_id: auth!.userId,
    action: 'admin_create_user',
    metadata: { email, phoneCredits: phoneCr, emailCredits: emailCr, unlimited: isUnlimited },
  })

  res.json({
    ok: true,
    userId,
    email,
    // Renvoie le mot de passe uniquement si généré automatiquement
    tempPassword: password?.trim() ? null : tempPassword,
  })
}
