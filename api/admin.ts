/**
 * /api/admin — point d'entrée unique pour toutes les routes admin.
 * Dispatch sur req.query.__path (passé via vercel.json rewrites) ou
 * sur l'URL réelle : /api/admin/users → __path=users, etc.
 */
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, requireAdmin, supabaseAdmin } from './_lib/supabase.js'
import { stripe } from './_lib/stripe.js'

// ── Matrix de permissions par scope ───────────────────────────────────────────
const SCOPE_ALLOWED: Record<string, readonly string[]> = {
  me:             ['super', 'support', 'dev'],
  dashboard:      ['super', 'support', 'dev'],
  metrics:        ['super', 'support', 'dev'],
  users:          ['super', 'support'],
  'user-full':    ['super', 'support'],
  'user-history': ['super', 'support'],
  searches:       ['super', 'support'],
  pipeline:       ['super', 'support'],
  stripe:         ['super'],
  logs:           ['super', 'dev'],
  settings:       ['super', 'dev'],
  team:           ['super'],
}

// Actions de user-full réservées aux super admins
const SUPER_ONLY_ACTIONS = new Set(['add_credits', 'set_unlimited', 'delete_account'])

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const auth = await authenticate(req)
  const denied = requireAdmin(auth)
  if (denied) { res.status(denied.status).json({ error: denied.message }); return }

  // Extrait la sous-route depuis l'URL : /api/admin/users → "users"
  const urlPath = req.url?.split('?')[0] ?? ''
  const sub = urlPath.replace(/^\/api\/admin\/?/, '').split('/')[0] || 'metrics'

  // Vérification du scope RBAC
  const scope = auth!.adminScope  // garanti non-null après requireAdmin
  const allowed = SCOPE_ALLOWED[sub] ?? ['super']
  if (!allowed.includes(scope)) {
    res.status(403).json({ error: `Rôle "${scope}" non autorisé sur /${sub}` }); return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // me — profil de l'admin connecté
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'me') {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('professional_email, first_name, last_name, admin_scope')
      .eq('id', auth!.userId)
      .single()
    res.json({
      userId:     auth!.userId,
      email:      auth!.email,
      adminScope: (profile as Record<string, unknown> | null)?.admin_scope ?? 'super',
      firstName:  (profile as Record<string, unknown> | null)?.first_name ?? null,
      lastName:   (profile as Record<string, unknown> | null)?.last_name ?? null,
    })
    return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // team — gestion des comptes admin et leurs scopes (super uniquement)
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'team') {
    if (req.method === 'GET') {
      const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, professional_email, first_name, last_name, admin_scope, last_login_at, created_at')
        .eq('role', 'admin')
        .order('created_at', { ascending: true })
      const adminIds = (data ?? []).map((a: Record<string, unknown>) => a.id as string)
      const { data: lastActions } = adminIds.length
        ? await supabaseAdmin
            .from('audit_logs')
            .select('actor_id, action, created_at')
            .in('actor_id', adminIds)
            .order('created_at', { ascending: false })
            .limit(adminIds.length * 5)
        : { data: [] }
      const lastActionMap = new Map<string, { action: string; created_at: string }>()
      for (const a of (lastActions ?? []) as Array<{ actor_id: string; action: string; created_at: string }>) {
        if (!lastActionMap.has(a.actor_id)) lastActionMap.set(a.actor_id, a)
      }
      res.json((data ?? []).map((a: Record<string, unknown>) => ({
        id:          a.id,
        email:       a.professional_email,
        firstName:   a.first_name,
        lastName:    a.last_name,
        adminScope:  (a.admin_scope as string | null) ?? 'super',
        lastLoginAt: a.last_login_at,
        createdAt:   a.created_at,
        lastAction:  lastActionMap.get(a.id as string) ?? null,
      })))
      return
    }
    if (req.method === 'POST') {
      const { userId, adminScope: newScope } = req.body as { userId?: string; adminScope?: string | null }
      if (!userId) { res.status(400).json({ error: 'userId requis' }); return }
      if (userId === auth!.userId) { res.status(400).json({ error: 'Impossible de modifier son propre scope' }); return }
      const valid = ['super', 'support', 'dev', null]
      if (!valid.includes(newScope ?? null)) { res.status(400).json({ error: 'Scope invalide' }); return }
      await supabaseAdmin.from('profiles').update({ admin_scope: newScope ?? null }).eq('id', userId)
      await supabaseAdmin.from('audit_logs').insert({
        actor_id:    auth!.userId,
        action:      'admin_set_scope',
        entity_type: 'profile',
        metadata:    { target_user: userId, admin_scope: newScope ?? 'super' },
      })
      res.json({ ok: true }); return
    }
    res.status(405).json({ error: 'Method not allowed' }); return
  }

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
        .select('id, professional_email, first_name, last_name, function_title, role, access_status, monthly_search_quota, created_at, last_login_at, cgu_accepted, ip_alert, ip_alert_reason, organization_id', { count: 'exact' })
        .order('created_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1)
      if (status === 'ip_alert') query = query.eq('ip_alert', true)
      else if (status) query = query.eq('access_status', status)
      if (search) query = query.or(`professional_email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`)
      const { data, error, count } = await query
      if (error) { console.error('[admin/users GET] supabase error:', error.message); res.status(500).json({ error: error.message }); return }

      const userIds = (data ?? []).map((u: Record<string, unknown>) => u.id as string)
      const orgIds2 = [...new Set((data ?? []).map((u: Record<string, unknown>) => u.organization_id).filter(Boolean))] as string[]
      let orgMap2: Record<string, Record<string, unknown>> = {}
      if (orgIds2.length > 0) {
        const { data: orgs2 } = await supabaseAdmin.from('organizations').select('id, siren, legal_name, administrative_status').in('id', orgIds2)
        if (orgs2) for (const o of orgs2) orgMap2[o.id] = o
      }
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString()

      // Recherches du mois en cours + déblocages — en parallèle
      const [{ data: searchRows }, { data: unlocks }] = await Promise.all([
        userIds.length
          ? supabaseAdmin.from('searches').select('user_id').in('user_id', userIds).gte('created_at', startOfMonth)
          : Promise.resolve({ data: [] }),
        userIds.length
          ? supabaseAdmin.from('contact_unlocks').select('unlocked_by, field_type').in('unlocked_by', userIds)
          : Promise.resolve({ data: [] }),
      ])

      // Agrégation côté JS (évite une RPC)
      const searchCountMap = new Map<string, number>()
      for (const s of (searchRows ?? []) as Array<{ user_id: string }>) {
        searchCountMap.set(s.user_id, (searchCountMap.get(s.user_id) ?? 0) + 1)
      }
      const unlockMap = new Map<string, { phone: number; email: number }>()
      for (const uc of (unlocks ?? []) as Array<{ unlocked_by: string; field_type: string }>) {
        const e = unlockMap.get(uc.unlocked_by) ?? { phone: 0, email: 0 }
        if (uc.field_type === 'phone') e.phone++
        else if (uc.field_type === 'email') e.email++
        unlockMap.set(uc.unlocked_by, e)
      }

      res.json({
        users: (data ?? []).map((u: Record<string, unknown>) => {
          const org = u.organization_id ? orgMap2[u.organization_id as string] ?? null : null
          const uc  = unlockMap.get(u.id as string) ?? { phone: 0, email: 0 }
          return { id: u.id, email: u.professional_email, firstName: u.first_name, lastName: u.last_name, functionTitle: u.function_title, role: u.role, status: u.access_status, quota: u.monthly_search_quota, createdAt: u.created_at, lastLoginAt: u.last_login_at, cguAccepted: u.cgu_accepted, organization: org ? { siren: org.siren, name: org.legal_name, active: org.administrative_status === 'A' } : null, monthlyUsage: searchCountMap.get(u.id as string) ?? 0, phoneUnlocks: uc.phone, emailUnlocks: uc.email, ipAlert: u.ip_alert ?? false, ipAlertReason: u.ip_alert_reason ?? null }
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
        const targetRole = String(value)
        if (!['agent', 'agence', 'admin'].includes(targetRole)) { res.status(400).json({ error: 'Rôle invalide' }); return }
        // Seul un admin peut attribuer le rôle admin, et seulement à un non-admin
        if (targetRole === 'admin') {
          const { data: targetProfile } = await supabaseAdmin.from('profiles').select('role').eq('id', userId).single()
          if (targetProfile?.role === 'admin') { res.status(403).json({ error: 'Ce compte est déjà admin' }); return }
        }
        update = { role: targetRole }
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
        res.json({ ok: true, message: `Magic link envoyé à ${au.user.email}` }); return
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
        .select('id, professional_email, first_name, last_name, function_title, role, access_status, monthly_search_quota, created_at, last_login_at, organization_id, registration_ip, cgu_accepted, cgu_accepted_at, cgu_ip')
        .eq('id', userId).single()
      if (pErr) { res.status(500).json({ error: pErr.message }); return }
      const orgId = (profile as Record<string, unknown>)?.organization_id as string | null

      // Org + monthly_usage séparément pour éviter les FK instables
      const [{ data: orgData }, { data: usageData }] = await Promise.all([
        orgId ? supabaseAdmin.from('organizations').select('siren, legal_name, administrative_status').eq('id', orgId).maybeSingle() : Promise.resolve({ data: null }),
        supabaseAdmin.from('monthly_usage').select('period_start, searches_used').eq('user_id', userId).order('period_start', { ascending: false }).limit(1).maybeSingle(),
      ])
      const profileFull = { ...(profile as Record<string, unknown>), organizations: orgData ?? null, monthly_usage: usageData ? [usageData] : [] }
      const [{ data: searches }, { data: unlocks }, { data: subscription }, { data: credits }] = await Promise.all([
        supabaseAdmin.from('searches').select('id, query_label, filters, result_count, units_consumed, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
        supabaseAdmin.from('contact_unlocks').select('id, field_type, contact_id, created_at').eq('unlocked_by', userId).order('created_at', { ascending: false }).limit(50),
        orgId ? supabaseAdmin.from('subscriptions').select('*').eq('organization_id', orgId).maybeSingle() : Promise.resolve({ data: null }),
        orgId ? supabaseAdmin.from('credit_balances').select('phone_credits, email_credits, unlimited, updated_at').eq('organization_id', orgId).maybeSingle() : Promise.resolve({ data: null }),
      ])
      const { data: ipLogs } = await supabaseAdmin.from('profile_ips').select('ip_address, user_agent, first_seen_at, last_seen_at, login_count').eq('profile_id', userId).order('last_seen_at', { ascending: false })
      const { data: devicesData } = await supabaseAdmin.from('user_devices').select('id, device_id, device_name, device_type, operating_system, browser, first_ip, last_ip, country, region, city, first_seen_at, last_seen_at, revoked_at, status').eq('user_id', userId).order('last_seen_at', { ascending: false })
      let stripeSubscription = null, stripeCustomer = null, stripeInvoices: unknown[] = []
      const subRecord = subscription as Record<string, unknown> | null
      if (subRecord?.provider_customer_id) {
        try {
          const customerId = subRecord.provider_customer_id as string
          const [cust, subs, invs] = await Promise.all([
            stripe.customers.retrieve(customerId),
            stripe.subscriptions.list({ customer: customerId, limit: 3, expand: ['data.items.data.price'] }),
            stripe.invoices.list({ customer: customerId, limit: 3, expand: ['data.charge'] }),
          ])
          if (!('deleted' in cust && cust.deleted)) {
            const c = cust as { id: string; email?: string; created: number }
            stripeCustomer = { id: c.id, email: c.email ?? '', created: new Date(c.created * 1000).toISOString() }
          }
          const sub = subs.data[0]
          if (sub) {
            const price = sub.items.data[0]?.price
            stripeSubscription = {
              id: sub.id, status: sub.status,
              planName: price?.nickname ?? price?.id ?? '—',
              amount: (price?.unit_amount ?? 0) / 100,
              currency: price?.currency ?? 'eur',
              interval: price?.recurring?.interval ?? 'month',
              currentPeriodEnd: new Date((sub as unknown as { current_period_end: number }).current_period_end * 1000).toISOString(),
              cancelAtPeriodEnd: sub.cancel_at_period_end,
            }
          }
          stripeInvoices = invs.data.map(inv => ({
            id: inv.id,
            number: inv.number,
            status: inv.status,
            amount: (inv.amount_paid ?? 0) / 100,
            currency: inv.currency,
            date: new Date((inv.created) * 1000).toISOString(),
            pdfUrl: inv.invoice_pdf,
            hostedUrl: inv.hosted_invoice_url,
          }))
        } catch { /* pas de customer Stripe */ }
      }
      res.json({ profile: profileFull, searches: searches ?? [], unlocks: unlocks ?? [], sessions: ipLogs ?? [], devices: devicesData ?? [], subscription: subRecord, credits, stripeSubscription, stripeCustomer, stripeInvoices })
      return
    }
    if (req.method === 'POST') {
      const { userId, action, value } = req.body as { userId?: string; action?: string; value?: Record<string, unknown> }
      if (!userId || !action) { res.status(400).json({ error: 'userId et action requis' }); return }
      if (SUPER_ONLY_ACTIONS.has(action) && scope !== 'super') {
        res.status(403).json({ error: `Action "${action}" réservée aux Super Admins` }); return
      }
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

      // ── Impersonation — génère un magic link direct sans envoyer d'email ──────
      if (action === 'impersonate') {
        if (userId === auth!.userId) {
          res.status(400).json({ error: 'Impossible de s\'impersonifier soi-même' }); return
        }

        const { data: au, error: auErr } = await supabaseAdmin.auth.admin.getUserById(userId)
        if (auErr || !au.user?.email) {
          res.status(400).json({ error: 'Utilisateur introuvable' }); return
        }

        // Le token redirige avec ?_imp=1 pour que le frontend puisse afficher la bannière
        const { data: linkData, error: lErr } = await supabaseAdmin.auth.admin.generateLink({
          type: 'magiclink',
          email: au.user.email,
          options: { redirectTo: 'https://www.xn--trouv-fsa.fr?_imp=1' },
        })

        if (lErr || !linkData) {
          res.status(500).json({ error: lErr?.message ?? 'Génération du lien échouée' }); return
        }

        // Supabase v2 : action_link est dans linkData.properties
        const props = (linkData as unknown as { properties?: { action_link?: string } }).properties
        const actionLink = props?.action_link
        if (!actionLink) {
          res.status(500).json({ error: 'action_link absent de la réponse Supabase' }); return
        }

        // Trace RGPD — toute impersonation doit être journalisée
        await supabaseAdmin.from('audit_logs').insert({
          actor_id: auth!.userId,
          action: 'admin_impersonate',
          entity_type: 'profile',
          metadata: {
            target_user: userId,
            target_email: au.user.email,
          },
        })

        res.json({ ok: true, link: actionLink }); return
      }

      if (action === 'delete_account') {
        const now = new Date()
        const ts  = now.getTime()

        // ① Récupère les données avant suppression (email, org)
        const { data: profileData } = await supabaseAdmin
          .from('profiles')
          .select('professional_email, first_name, last_name, organization_id')
          .eq('id', userId)
          .single()
        const pd = profileData as Record<string, unknown> | null
        const originalEmail = (pd?.professional_email as string) ?? 'inconnu'
        const orgId         = (pd?.organization_id  as string) ?? null

        // ② Annule l'abonnement Stripe si existant
        let stripeCancelled = false
        let stripeCustomerId: string | null = null
        if (orgId) {
          const { data: subData } = await supabaseAdmin
            .from('subscriptions')
            .select('provider_subscription_id, provider_customer_id, status')
            .eq('organization_id', orgId)
            .maybeSingle()
          const subRec = subData as Record<string, unknown> | null
          stripeCustomerId = (subRec?.provider_customer_id as string) ?? null
          const subId      = (subRec?.provider_subscription_id as string) ?? null
          if (subId && subRec?.status !== 'canceled') {
            try {
              await stripe.subscriptions.cancel(subId, { prorate: false })
              stripeCancelled = true
            } catch { /* déjà annulé ou inexistant */ }
          }
        }

        // ③ Enregistre la demande dans privacy_requests (traçabilité CNIL)
        await supabaseAdmin.from('privacy_requests').insert({
          user_id:            userId,
          professional_email: originalEmail,
          request_type:       'erasure',
          details:            'Suppression définitive RGPD déclenchée par admin',
          status:             'completed',
          handled_by:         auth!.userId,
          handled_at:         now.toISOString(),
        })

        // ④ Supprime les données utilisateur en parallèle
        await Promise.all([
          supabaseAdmin.from('searches')       .delete().eq('user_id',    userId),
          supabaseAdmin.from('contact_unlocks').delete().eq('unlocked_by', userId),
          supabaseAdmin.from('favorites')      .delete().eq('user_id',    userId),
          supabaseAdmin.from('profile_ips')    .delete().eq('profile_id', userId),
          supabaseAdmin.from('user_devices')   .delete().eq('user_id',    userId),
          supabaseAdmin.from('monthly_usage')  .delete().eq('user_id',    userId),
        ])

        // ⑤ Si dernier membre de l'org → nettoie les données d'organisation
        if (orgId) {
          const { count: remaining } = await supabaseAdmin
            .from('profiles')
            .select('*', { count: 'exact', head: true })
            .eq('organization_id', orgId)
            .neq('id', userId)
          if ((remaining ?? 0) === 0) {
            await Promise.all([
              supabaseAdmin.from('credit_balances') .delete().eq('organization_id', orgId),
              supabaseAdmin.from('addon_purchases') .delete().eq('organization_id', orgId),
              supabaseAdmin.from('subscriptions').update({
                status: 'canceled', canceled_at: now.toISOString(), updated_at: now.toISOString(),
              }).eq('organization_id', orgId),
            ])
          }
        }

        // ⑥ Anonymise le profil (ne PAS supprimer — préserve l'intégrité FK des audit_logs)
        await supabaseAdmin.from('profiles').update({
          first_name:           'Supprimé',
          last_name:            'RGPD',
          professional_email:   `supprime-${ts}@rgpd.invalid`,
          function_title:       null,
          website:              null,
          registration_ip:      null,
          cgu_ip:               null,
          ip_alert:             null,
          ip_alert_reason:      null,
          access_status:        'rejected',
          monthly_search_quota: 0,
          organization_id:      null,
          last_login_at:        null,
          updated_at:           now.toISOString(),
        }).eq('id', userId)

        // ⑦ Audit log AVANT deleteUser (irréversible)
        await supabaseAdmin.from('audit_logs').insert({
          actor_id:    auth!.userId,
          action:      'rgpd_erasure',
          entity_type: 'profile',
          metadata: {
            target_user:        userId,
            target_email:       originalEmail,
            stripe_cancelled:   stripeCancelled,
            stripe_customer_id: stripeCustomerId,
            organization_id:    orgId,
            deleted_at:         now.toISOString(),
          },
        })

        // ⑧ Supprime le compte Auth — TOUJOURS EN DERNIER (irréversible)
        const { error: delErr } = await supabaseAdmin.auth.admin.deleteUser(userId)
        if (delErr) { res.status(500).json({ error: delErr.message }); return }

        res.json({ ok: true, deletedEmail: originalEmail, stripeCancelled }); return
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
      supabaseAdmin.from('profiles').select('id, professional_email, first_name, last_name, function_title, role, access_status, monthly_search_quota, created_at, last_login_at, organization_id').eq('id', userId).single(),
      supabaseAdmin.from('searches').select('id, query_label, filters, result_count, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
      supabaseAdmin.from('contact_unlocks').select('id, field_type, prospect_id, created_at').eq('user_id', userId).order('created_at', { ascending: false }).limit(50),
    ])
    const histOrgId = (profile as Record<string, unknown> | null)?.organization_id as string | null
    let histProfile: Record<string, unknown> = { ...(profile as Record<string, unknown> ?? {}) }
    if (histOrgId) {
      const { data: histOrg } = await supabaseAdmin.from('organizations').select('siren, legal_name').eq('id', histOrgId).maybeSingle()
      histProfile.organizations = histOrg ?? null
    }
    res.json({ profile: histProfile, searches: searches ?? [], unlocks: unlocks ?? [] })
    return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // settings — feature flags (lecture + toggle)
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'settings') {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('feature_flags')
        .select('key, label, description, enabled, updated_at, updated_by, profiles!feature_flags_updated_by_fkey(professional_email)')
        .order('key')
      if (error) { res.status(500).json({ error: error.message }); return }
      res.json(data ?? [])
      return
    }

    if (req.method === 'POST') {
      const { key, enabled } = req.body as { key?: string; enabled?: boolean }
      if (!key || enabled === undefined) { res.status(400).json({ error: 'key et enabled requis' }); return }

      const { error } = await supabaseAdmin
        .from('feature_flags')
        .update({ enabled, updated_at: new Date().toISOString(), updated_by: auth!.userId })
        .eq('key', key)
      if (error) { res.status(500).json({ error: error.message }); return }

      await supabaseAdmin.from('audit_logs').insert({
        actor_id: auth!.userId,
        action: 'admin_toggle_flag',
        entity_type: 'feature_flag',
        metadata: { key, enabled },
      })

      res.json({ ok: true }); return
    }

    res.status(405).json({ error: 'Method not allowed' }); return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // dashboard — 4 KPIs temps réel (1 seul appel)
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'dashboard') {
    if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

    const now = new Date()
    const todayStart     = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString()
    const sevenDaysAgo   = new Date(Date.now() - 7 * 86_400_000).toISOString()
    const startOfMonth   = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
    const startOfMonthTs = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
    const lastMonthTs    = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000)

    const [
      { count: requestsToday },
      { count: signups7d },
      { data: signupsRaw },
      { count: errorsToday },
      { count: totalEventsToday },
      { count: totalUsers },
      { count: pendingUsers },
      { count: newThisMonth },
      { count: searchesThisMonth },
      { count: unlocksThisMonth },
      { data: recentSearches },
      stripeActiveSubs,
      stripeRecentCharges,
      stripeSubsStats,
    ] = await Promise.all([
      // KPI 1 — Requêtes aujourd'hui (table searches)
      supabaseAdmin.from('searches').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
      // KPI 2 — Inscriptions 7 jours
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', sevenDaysAgo),
      supabaseAdmin.from('profiles').select('created_at').gte('created_at', sevenDaysAgo).order('created_at', { ascending: true }),
      // KPI 4 — Erreurs aujourd'hui
      supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true }).or('action.ilike.%error%,action.eq.alerte_paiement').gte('created_at', todayStart),
      supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true }).gte('created_at', todayStart),
      // Contexte utilisateurs
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('access_status', 'approved'),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).eq('access_status', 'pending'),
      supabaseAdmin.from('profiles').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
      supabaseAdmin.from('searches').select('*', { count: 'exact', head: true }).gte('created_at', startOfMonth),
      supabaseAdmin.from('contact_unlocks').select('*', { count: 'exact', head: true }).gte('unlocked_at', startOfMonth),
      // Activité récente
      supabaseAdmin.from('searches').select('id, query_label, result_count, created_at, profiles!searches_user_id_fkey(professional_email)').order('created_at', { ascending: false }).limit(8),
      // KPI 3 — MRR via Stripe
      stripe.subscriptions.list({ status: 'active', limit: 100, expand: ['data.items.data.price'] }),
      stripe.charges.list({ limit: 8, created: { gte: startOfMonthTs } }),
      stripe.subscriptions.list({ status: 'all', limit: 100, created: { gte: lastMonthTs } }),
    ])

    // ── MRR ──────────────────────────────────────────────────────────────────
    let mrrCents = 0
    for (const s of stripeActiveSubs.data) {
      for (const item of s.items.data) {
        const price = item.price
        if (!price.unit_amount) continue
        const amount = price.unit_amount * (item.quantity ?? 1)
        if (price.recurring?.interval === 'month') mrrCents += amount
        else if (price.recurring?.interval === 'year') mrrCents += Math.round(amount / 12)
      }
    }

    // ── Sparkline inscriptions 7 jours ────────────────────────────────────────
    const dayMap: Record<string, number> = {}
    for (let i = 6; i >= 0; i--) {
      dayMap[new Date(Date.now() - i * 86_400_000).toISOString().slice(0, 10)] = 0
    }
    for (const p of (signupsRaw ?? []) as Array<{ created_at: string }>) {
      const day = p.created_at.slice(0, 10)
      if (day in dayMap) dayMap[day]++
    }

    // ── Taux d'erreur ─────────────────────────────────────────────────────────
    const totalEvents = totalEventsToday ?? 0
    const errors      = errorsToday ?? 0

    res.json({
      kpis: {
        requestsToday: requestsToday ?? 0,
        signups7d: signups7d ?? 0,
        signupsSparkline: Object.entries(dayMap).map(([date, count]) => ({ date, count })),
        mrr: { cents: mrrCents, euros: (mrrCents / 100).toFixed(2) },
        errorRate: {
          percent: totalEvents > 0 ? Math.round((errors / totalEvents) * 100) : 0,
          errorsToday: errors,
          totalEventsToday: totalEvents,
        },
      },
      users: { total: totalUsers ?? 0, pending: pendingUsers ?? 0, newThisMonth: newThisMonth ?? 0 },
      activity: { searchesThisMonth: searchesThisMonth ?? 0, unlocksThisMonth: unlocksThisMonth ?? 0 },
      subscriptions: {
        active: stripeActiveSubs.data.length,
        newThisMonth:      stripeSubsStats.data.filter(s => s.created >= startOfMonthTs).length,
        canceledThisMonth: stripeSubsStats.data.filter(s => s.status === 'canceled' && (s.canceled_at ?? 0) >= startOfMonthTs).length,
      },
      recentSearches: (recentSearches ?? []).map((s: Record<string, unknown>) => ({
        id: s.id, queryLabel: s.query_label, resultCount: s.result_count, createdAt: s.created_at,
        userEmail: (s.profiles as Record<string, unknown> | null)?.professional_email ?? '—',
      })),
      recentCharges: stripeRecentCharges.data.slice(0, 8).map(c => ({
        id: c.id, amountEuros: (c.amount / 100).toFixed(2), currency: c.currency,
        paid: c.paid, refunded: c.refunded,
        description: c.description ?? (c.billing_details as { name?: string } | null)?.name ?? '—',
        createdAt: new Date(c.created * 1000).toISOString(),
      })),
    })
    return
  }

  // ──────────────────────────────────────────────────────────────────────────
  // pipeline — CRUD leads commerciaux
  // ──────────────────────────────────────────────────────────────────────────
  if (sub === 'pipeline') {
    if (req.method === 'GET') {
      const { data, error } = await supabaseAdmin
        .from('pipeline_leads')
        .select('*')
        .order('created_at', { ascending: false })
      if (error) { res.status(500).json({ error: error.message }); return }
      res.json(data)
      return
    }

    if (req.method === 'POST') {
      const { name, email, company, stage, notes, value_eur } = req.body as Record<string, unknown>
      if (!name) { res.status(400).json({ error: 'name requis' }); return }
      const { data, error } = await supabaseAdmin
        .from('pipeline_leads')
        .insert({ name, email, company, stage: stage ?? 'prospect', notes, value_eur: value_eur ?? 0 })
        .select()
        .single()
      if (error) { res.status(500).json({ error: error.message }); return }
      res.status(201).json(data)
      return
    }

    if (req.method === 'PATCH') {
      const id = req.query.id as string
      if (!id) { res.status(400).json({ error: 'id requis' }); return }
      const { name, email, company, stage, notes, value_eur } = req.body as Record<string, unknown>
      const { data, error } = await supabaseAdmin
        .from('pipeline_leads')
        .update({ name, email, company, stage, notes, value_eur })
        .eq('id', id)
        .select()
        .single()
      if (error) { res.status(500).json({ error: error.message }); return }
      res.json(data)
      return
    }

    if (req.method === 'DELETE') {
      const id = req.query.id as string
      if (!id) { res.status(400).json({ error: 'id requis' }); return }
      const { error } = await supabaseAdmin.from('pipeline_leads').delete().eq('id', id)
      if (error) { res.status(500).json({ error: error.message }); return }
      res.status(204).end()
      return
    }

    res.status(405).json({ error: 'Method not allowed' }); return
  }

  res.status(404).json({ error: 'Route admin inconnue' })
}
