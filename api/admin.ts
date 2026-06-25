/**
 * /api/admin — point d'entrée unique pour toutes les routes admin.
 * Dispatch sur req.query.__path (passé via vercel.json rewrites) ou
 * sur l'URL réelle : /api/admin/users → __path=users, etc.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, requireAdmin, supabaseAdmin } from './_lib/supabase.js'
import { stripe } from './_lib/stripe.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticate(req)
  const denied = requireAdmin(auth)
  if (denied) { res.status(denied.status).json({ error: denied.message }); return }

  // Extrait la sous-route depuis l'URL : /api/admin/users → "users"
  const urlPath = req.url?.split('?')[0] ?? ''
  const sub = urlPath.replace(/^\/api\/admin\/?/, '').split('/')[0] || 'metrics'

  // ──────────────────────────────────────────────────────────────────────────
  // metrics
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'metrics') {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const now = new Date()
    const startOfMonth     = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString()

    const [
      { count: totalUsers },
      { count: newUsersThisMonth },
      { count: pendingApprovals },
      { count: searchesThisMonth },
      { count: unlocksThisMonth },
      { data: topOrgs },
      { data: recentSearches },
      { data: creditUsage },
    ] = await Promise.all([
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('access_status', 'approved'),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('access_status', 'pending'),
      supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true }).eq('action', 'search').gte('created_at', startOfMonth),
      supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true }).eq('action', 'unlock').gte('created_at', startOfMonth),
      supabaseAdmin.from('monthly_usage').select('organization_id, searches_used, organizations(name)').gte('period_start', startOfMonth).order('searches_used', { ascending: false }).limit(10),
      supabaseAdmin.from('searches').select('id, query_label, filters, result_count, created_at, profiles(email)').order('created_at', { ascending: false }).limit(20),
      supabaseAdmin.from('contact_unlocks').select('field_type, created_at').gte('created_at', startOfLastMonth),
    ])

    const creditsThisMonth = (creditUsage ?? []).filter((u: { created_at: string }) => u.created_at >= startOfMonth)
    const creditsLastMonth = (creditUsage ?? []).filter((u: { created_at: string }) => u.created_at < startOfMonth)
    res.json({
      users: { total: totalUsers ?? 0, newThisMonth: newUsersThisMonth ?? 0, pendingApprovals: pendingApprovals ?? 0 },
      activity: { searchesThisMonth: searchesThisMonth ?? 0, unlocksThisMonth: unlocksThisMonth ?? 0 },
      credits: { thisMonth: creditsThisMonth.length, lastMonth: creditsLastMonth.length, byType: { phone: creditsThisMonth.filter((u: { field_type: string }) => u.field_type === 'phone').length, email: creditsThisMonth.filter((u: { field_type: string }) => u.field_type === 'email').length } },
      topOrgs: (topOrgs ?? []).map((o: Record<string, unknown>) => ({ organizationId: o.organization_id, name: (o.organizations as Record<string, unknown> | null)?.name ?? '—', searchesUsed: o.searches_used })),
      recentSearches: (recentSearches ?? []).map((s: Record<string, unknown>) => ({ id: s.id, queryLabel: s.query_label, filters: s.filters, resultCount: s.result_count, createdAt: s.created_at, userEmail: (s.profiles as Record<string, unknown> | null)?.email ?? '—' })),
    })
    return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // logs
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'logs') {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const limit  = Math.min(200, parseInt(String(req.query.limit ?? '100'), 10))
    const action = req.query.action as string | undefined
    let query = supabaseAdmin
      .from('audit_logs')
      .select('id, action, actor_id, metadata, created_at, profiles!audit_logs_actor_id_fkey(professional_email)')
      .order('created_at', { ascending: false })
      .limit(limit)
    if (action) query = query.eq('action', action)
    const { data, error } = await query
    if (error) { res.status(500).json({ error: error.message }); return }
    const last24h = new Date(Date.now() - 86400000).toISOString()
    const [{ count: searchesToday }, { count: unlocksToday }, { count: errorsToday }] = await Promise.all([
      supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true }).eq('action', 'search').gte('created_at', last24h),
      supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true }).eq('action', 'unlock').gte('created_at', last24h),
      supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true }).ilike('action', '%error%').gte('created_at', last24h),
    ])
    res.json({
      logs: (data ?? []).map((l: Record<string, unknown>) => ({ id: l.id, action: l.action, actorEmail: (l.profiles as Record<string, unknown> | null)?.professional_email ?? l.actor_id, metadata: l.metadata, createdAt: l.created_at })),
      health: { searchesToday: searchesToday ?? 0, unlocksToday: unlocksToday ?? 0, errorsToday: errorsToday ?? 0 },
    })
    return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // stripe
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'stripe') {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const now = new Date()
    const startOfMonth     = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
    const startOfLastMonth = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000)
    const endOfLastMonth   = startOfMonth - 1
    const [mrrResult, recentCharges, subsResult] = await Promise.all([
      stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items.data.price'] }),
      stripe.charges.list({ limit: 20, created: { gte: startOfMonth } }),
      stripe.subscriptions.list({ status: 'all', limit: 100, created: { gte: startOfLastMonth } }),
    ])
    let mrrCents = 0
    for (const sub of mrrResult.data) {
      for (const item of sub.items.data) {
        const price = item.price
        if (!price.unit_amount) continue
        const amount = price.unit_amount * (item.quantity ?? 1)
        if (price.recurring?.interval === 'month') mrrCents += amount
        else if (price.recurring?.interval === 'year') mrrCents += Math.round(amount / 12)
      }
    }
    const revenueThisMonth = recentCharges.data.filter(c => c.paid && !c.refunded).reduce((s, c) => s + c.amount, 0)
    res.json({
      mrr: { cents: mrrCents, euros: (mrrCents / 100).toFixed(2) },
      revenue: { thisMonthCents: revenueThisMonth, thisMonthEuros: (revenueThisMonth / 100).toFixed(2) },
      subscriptions: {
        active: mrrResult.data.length,
        newThisMonth:     subsResult.data.filter(s => s.created >= startOfMonth).length,
        newLastMonth:     subsResult.data.filter(s => s.created >= startOfLastMonth && s.created <= endOfLastMonth).length,
        canceledThisMonth: subsResult.data.filter(s => s.status === 'canceled' && (s.canceled_at ?? 0) >= startOfMonth).length,
      },
      recentCharges: recentCharges.data.slice(0, 10).map(c => ({ id: c.id, amountEuros: (c.amount / 100).toFixed(2), currency: c.currency, paid: c.paid, refunded: c.refunded, description: c.description ?? c.billing_details?.name ?? '—', createdAt: new Date(c.created * 1000).toISOString() })),
    })
    return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // users
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'users') {
    if (req.method === 'GET') {
      const page   = Math.max(1, parseInt(String(req.query.page  ?? '1'), 10))
      const limit  = Math.min(100, parseInt(String(req.query.limit ?? '50'), 10))
      const status = req.query.status as string | undefined
      const search = req.query.search as string | undefined
      let query = supabaseAdmin
        .from('profiles')
        .select(`id, professional_email, first_name, last_name, function_title, role, access_status, monthly_search_quota, created_at, last_login_at, cgu_accepted, ip_alert, ip_alert_reason, organizations!profiles_organization_id_fkey(siren, legal_name, administrative_status), monthly_usage(period_start, searches_used)`, { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1)
      if (status === 'ip_alert') query = query.eq('ip_alert', true)
      else if (status) query = query.eq('access_status', status)
      if (search) query = query.or(`professional_email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
      const { data, error, count } = await query
      if (error) { res.status(500).json({ error: error.message }); return }
      res.json({
        users: (data ?? []).map((u: Record<string, unknown>) => {
          const org   = u.organizations as Record<string, unknown> | null
          const usage = ((u.monthly_usage as Array<{ period_start: string; searches_used: number }> | null) ?? []).sort((a, b) => b.period_start.localeCompare(a.period_start))
          return { id: u.id, email: u.professional_email, firstName: u.first_name, lastName: u.last_name, functionTitle: u.function_title, role: u.role, status: u.access_status, quota: u.monthly_search_quota, createdAt: u.created_at, lastLoginAt: u.last_login_at, cguAccepted: u.cgu_accepted, organization: org ? { siren: org.siren, name: org.legal_name, active: org.administrative_status === 'A' } : null, monthlyUsage: usage[0]?.searches_used ?? 0, ipAlert: u.ip_alert ?? false, ipAlertReason: u.ip_alert_reason ?? null }
        }),
        total: count ?? 0, page, limit,
      })
      return
    }
    if (req.method === 'POST') {
      const { userId, action, value } = req.body as { userId?: string; action?: string; value?: string | number }
      if (!userId || !action) { res.status(400).json({ error: 'userId et action requis' }); return }
      let update: Record<string, unknown> = {}
      if (action === 'approve') update = { access_status: 'approved' }
      else if (action === 'reject') update = { access_status: 'rejected' }
      else if (action === 'block') update = { access_status: 'blocked' }
      else if (action === 'set_role') {
        if (!['agent', 'agence', 'admin'].includes(String(value))) { res.status(400).json({ error: 'Rôle invalide' }); return }
        update = { role: value }
      } else if (action === 'set_quota') {
        const quota = parseInt(String(value), 10)
        if (isNaN(quota) || quota < 0) { res.status(400).json({ error: 'Quota invalide' }); return }
        update = { monthly_search_quota: quota }
      } else if (action === 'reset_password') {
        const { data: au, error: auErr } = await supabaseAdmin.auth.admin.getUserById(userId)
        if (auErr || !au.user?.email) { res.status(400).json({ error: 'Email introuvable' }); return }
        const { error: rErr } = await supabaseAdmin.auth.resetPasswordForEmail(au.user.email, { redirectTo: 'https://www.xn--trouv-fsa.fr' })
        if (rErr) { res.status(500).json({ error: rErr.message }); return }
        await supabaseAdmin.from('audit_logs').insert({ actor_id: auth!.userId, action: 'admin_reset_password', metadata: { target_user: userId } })
        res.json({ ok: true, message: `Email de réinitialisation envoyé à ${au.user.email}` }); return
      } else if (action === 'magic_link') {
        const { data: au, error: auErr } = await supabaseAdmin.auth.admin.getUserById(userId)
        if (auErr || !au.user?.email) { res.status(400).json({ error: 'Email introuvable' }); return }
        const { data: linkData, error: lErr } = await supabaseAdmin.auth.admin.generateLink({ type: 'magiclink', email: au.user.email, options: { redirectTo: 'https://www.xn--trouv-fsa.fr' } })
        if (lErr) { res.status(500).json({ error: lErr.message }); return }
        await supabaseAdmin.from('audit_logs').insert({ actor_id: auth!.userId, action: 'admin_magic_link', metadata: { target_user: userId } })
        res.json({ ok: true, link: linkData.properties?.action_link ?? null }); return
      } else { res.status(400).json({ error: 'Action inconnue' }); return }
      const { error } = await supabaseAdmin.from('profiles').update(update).eq('id', userId)
      if (error) { res.status(500).json({ error: error.message }); return }
      await supabaseAdmin.from('audit_logs').insert({ actor_id: auth!.userId, action: `admin_${action}`, metadata: { target_user: userId, value } })
      res.json({ ok: true }); return
    }
    res.status(405).json({ error: 'Method not allowed' }); return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // user-full
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'user-full') {
    if (req.method === 'GET') {
      const userId = req.query.userId as string
      if (!userId) { res.status(400).json({ error: 'userId requis' }); return }
      const { data: profile, error: pErr } = await supabaseAdmin
        .from('profiles')
        .select(`id, professional_email, first_name, last_name, function_title, role, access_status, monthly_search_quota, created_at, last_login_at, organization_id, registration_ip, cgu_accepted, cgu_accepted_at, cgu_ip, organizations!profiles_organization_id_fkey(siren, legal_name, administrative_status), monthly_usage(period_start, searches_used)`)
        .eq('id', userId).single()
      if (pErr) { res.status(500).json({ error: pErr.message }); return }
      const orgId = (profile as Record<string, unknown>)?.organization_id as string | null
      const [{ data: searches }, { data: unlocks }, { data: subscription }, { data: credits }] = await Promise.all([
        supabaseAdmin.from('searches').select('id, query_label, result_count, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
        supabaseAdmin.from('contact_unlocks').select('id, field_type, prospect_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(30),
        orgId ? supabaseAdmin.from('subscriptions').select('*').eq('organization_id', orgId).maybeSingle() : Promise.resolve({ data: null }),
        orgId ? supabaseAdmin.from('credit_balances').select('phone_credits, email_credits, unlimited, updated_at').eq('organization_id', orgId).maybeSingle() : Promise.resolve({ data: null }),
      ])
      const { data: ipLogs } = await supabaseAdmin.from('profile_ips').select('ip_address, user_agent, first_seen_at, last_seen_at, login_count').eq('profile_id', userId).order('last_seen_at', { ascending: false })
      const { data: devicesData } = await supabaseAdmin.from('user_devices').select('id, device_id, device_name, device_type, operating_system, browser, first_ip, last_ip, country, region, city, first_seen_at, last_seen_at, revoked_at, status').eq('user_id', userId).order('last_seen_at', { ascending: false })
      let stripeSubscription = null, stripeCustomer = null
      const subRecord = subscription as Record<string, unknown> | null
      if (subRecord?.provider_customer_id) {
        try {
          const customerId = subRecord.provider_customer_id as string
          const [cust, subs] = await Promise.all([
            stripe.customers.retrieve(customerId),
            stripe.subscriptions.list({ customer: customerId, limit: 3, expand: ['data.items.data.price'] }),
          ])
          if (!('deleted' in cust && cust.deleted)) {
            const c = cust as { id: string; email?: string; created: number }
            stripeCustomer = { id: c.id, email: c.email ?? '', created: new Date(c.created * 1000).toISOString() }
          }
          const sub = subs.data[0]
          if (sub) {
            const price = sub.items.data[0]?.price
            stripeSubscription = { id: sub.id, status: sub.status, planName: price?.nickname ?? price?.id ?? '—', amount: (price?.unit_amount ?? 0) / 100, currency: price?.currency ?? 'eur', interval: price?.recurring?.interval ?? 'month', currentPeriodEnd: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(), cancelAtPeriodEnd: sub.cancel_at_period_end }
          }
        } catch { /* pas de customer Stripe */ }
      }
      res.json({ profile, searches: searches ?? [], unlocks: unlocks ?? [], sessions: ipLogs ?? [], devices: devicesData ?? [], subscription: subRecord, credits, stripeSubscription, stripeCustomer })
      return
    }
    if (req.method === 'POST') {
      const { userId, action, value } = req.body as { userId?: string; action?: string; value?: Record<string, unknown> }
      if (!userId || !action) { res.status(400).json({ error: 'userId et action requis' }); return }
      const getOrgId = async () => { const { data } = await supabaseAdmin.from('profiles').select('organization_id').eq('id', userId).single(); return (data as Record<string, unknown> | null)?.organization_id as string | null }
      if (action === 'add_credits') {
        const phone = parseInt(String(value?.phone ?? '0'), 10), email = parseInt(String(value?.email ?? '0'), 10)
        const orgId = await getOrgId()
        if (!orgId) { res.status(400).json({ error: "Pas d'organisation liée" }); return }
        const { error } = await supabaseAdmin.from('credit_balances').upsert({ organization_id: orgId, phone_credits: phone, email_credits: email, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' })
        if (error) { res.status(500).json({ error: error.message }); return }
        await supabaseAdmin.from('audit_logs').insert({ actor_id: auth!.userId, action: 'admin_add_credits', metadata: { target_user: userId, phone, email } })
        res.json({ ok: true }); return
      }
      if (action === 'revoke_sessions') {
        const { error } = await supabaseAdmin.auth.admin.signOut(userId, 'global')
        if (error) { res.status(500).json({ error: error.message }); return }
        await supabaseAdmin.from('user_devices').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('user_id', userId).eq('status', 'active')
        await supabaseAdmin.from('audit_logs').insert({ actor_id: auth!.userId, action: 'admin_revoke_sessions', metadata: { target_user: userId } })
        res.json({ ok: true }); return
      }
      if (action === 'revoke_device') {
        const deviceId = value?.deviceId as string
        if (!deviceId) { res.status(400).json({ error: 'deviceId requis' }); return }
        await supabaseAdmin.from('user_devices').update({ status: 'revoked', revoked_at: new Date().toISOString() }).eq('id', deviceId).eq('user_id', userId)
        await supabaseAdmin.from('audit_logs').insert({ actor_id: auth!.userId, action: 'admin_revoke_device', metadata: { target_user: userId, device_id: deviceId } })
        res.json({ ok: true }); return
      }
      if (action === 'set_role') {
        const role = value?.role as string
        if (!['agent', 'agence', 'admin'].includes(role)) { res.status(400).json({ error: 'Rôle invalide' }); return }
        await supabaseAdmin.from('profiles').update({ role }).eq('id', userId)
        await supabaseAdmin.from('audit_logs').insert({ actor_id: auth!.userId, action: 'admin_set_role', metadata: { target_user: userId, role } })
        res.json({ ok: true }); return
      }
      if (action === 'set_unlimited') {
        const orgId = await getOrgId()
        if (!orgId) { res.status(400).json({ error: "Pas d'organisation liée" }); return }
        await supabaseAdmin.from('credit_balances').upsert({ organization_id: orgId, unlimited: value?.unlimited === true, updated_at: new Date().toISOString() }, { onConflict: 'organization_id' })
        res.json({ ok: true }); return
      }
      if (action === 'approve') { await supabaseAdmin.from('profiles').update({ access_status: 'approved' }).eq('id', userId); res.json({ ok: true }); return }
      if (action === 'block')   { await supabaseAdmin.from('profiles').update({ access_status: 'blocked'  }).eq('id', userId); res.json({ ok: true }); return }
      if (action === 'delete_account') {
        await supabaseAdmin.from('profiles').delete().eq('id', userId)
        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
        if (delErr) { res.status(500).json({ error: delErr.message }); return }
        res.json({ ok: true }); return
      }
      res.status(400).json({ error: 'Action inconnue' }); return
    }
    res.status(405).json({ error: 'Method not allowed' }); return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // user-history
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'user-history') {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const userId = req.query.userId as string
    if (!userId) { res.status(400).json({ error: 'userId requis' }); return }
    const [{ data: profile }, { data: searches }, { data: unlocks }] = await Promise.all([
      supabaseAdmin.from('profiles').select('id, professional_email, first_name, last_name, function_title, role, access_status, monthly_search_quota, created_at, last_login_at, organizations(siren, legal_name), monthly_usage(period_start, searches_used)').eq('id', userId).single(),
      supabaseAdmin.from('searches').select('id, query_label, filters, result_count, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('contact_unlocks').select('id, field_type, prospect_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    ])
    res.json({ profile, searches: searches ?? [], unlocks: unlocks ?? [] })
    return
  }

  res.status(404).json({ error: 'Route admin inconnue' })
}
