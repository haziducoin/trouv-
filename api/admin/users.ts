import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, requireAdmin, supabaseAdmin } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  try {
  const auth = await authenticate(req)
  const denied = requireAdmin(auth)
  if (denied) {
    res.status(denied.status).json({ error: denied.message })
    return
  }

  // ── GET : liste paginée des utilisateurs ─────────────────────────────────
  if (req.method === 'GET') {
    const page   = Math.max(1, parseInt(String(req.query.page  ?? '1'), 10))
    const limit  = Math.min(100, parseInt(String(req.query.limit ?? '50'), 10))
    const status = req.query.status as string | undefined
    const search = req.query.search as string | undefined

    // Requête principale — colonnes de base uniquement
    let baseQuery = supabaseAdmin
      .from('profiles')
      .select('id, professional_email, first_name, last_name, function_title, role, access_status, monthly_search_quota, created_at, last_login_at, cgu_accepted, organization_id', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (status) baseQuery = baseQuery.eq('access_status', status)
    if (search) baseQuery = baseQuery.or(
      `professional_email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    )

    const { data, error, count } = await baseQuery
    if (error) {
      console.error('[admin/users GET] supabase error:', error.message, error.details)
      res.status(500).json({ error: error.message })
      return
    }

    const users = data ?? []

    // Récupération des organisations en une seule requête
    const orgIds = [...new Set(users.map((u: Record<string, unknown>) => u.organization_id).filter(Boolean))] as string[]
    let orgMap: Record<string, Record<string, unknown>> = {}
    if (orgIds.length > 0) {
      const { data: orgs } = await supabaseAdmin
        .from('organizations')
        .select('id, siren, legal_name, administrative_status')
        .in('id', orgIds)
      if (orgs) {
        for (const o of orgs) orgMap[o.id] = o
      }
    }

    // Récupération du monthly_usage en une seule requête
    const userIds = users.map((u: Record<string, unknown>) => u.id as string)
    let usageMap: Record<string, number> = {}
    if (userIds.length > 0) {
      const { data: usages } = await supabaseAdmin
        .from('monthly_usage')
        .select('user_id, searches_used, period_start')
        .in('user_id', userIds)
        .order('period_start', { ascending: false })
      if (usages) {
        const seen = new Set<string>()
        for (const u of usages) {
          if (!seen.has(u.user_id)) {
            seen.add(u.user_id)
            usageMap[u.user_id] = u.searches_used ?? 0
          }
        }
      }
    }

    res.json({
      users: users.map((u: Record<string, unknown>) => {
        const org = u.organization_id ? orgMap[u.organization_id as string] ?? null : null
        return {
          id: u.id,
          email: u.professional_email,
          firstName: u.first_name,
          lastName: u.last_name,
          functionTitle: u.function_title,
          role: u.role,
          status: u.access_status,
          quota: u.monthly_search_quota,
          createdAt: u.created_at,
          lastLoginAt: u.last_login_at,
          cguAccepted: u.cgu_accepted,
          organization: org ? {
            siren: org.siren,
            name: org.legal_name,
            active: org.administrative_status === 'A',
          } : null,
          monthlyUsage: usageMap[u.id as string] ?? 0,
        }
      }),
      total: count ?? 0,
      page,
      limit,
    })
    return
  }

  // ── POST : action sur un utilisateur ─────────────────────────────────────
  if (req.method === 'POST') {
    const { userId, action, value } = req.body as {
      userId?: string
      action?: 'approve' | 'reject' | 'block' | 'set_role' | 'set_quota'
      value?: string | number
    }

    if (!userId || !action) {
      res.status(400).json({ error: 'userId et action requis' })
      return
    }

    let update: Record<string, unknown> = {}

    switch (action) {
      case 'approve':
        update = { access_status: 'approved' }
        break
      case 'reject':
        update = { access_status: 'rejected' }
        break
      case 'block':
        update = { access_status: 'blocked' }
        break
      case 'set_role':
        if (!['agent', 'agence', 'admin'].includes(String(value))) {
          res.status(400).json({ error: 'Rôle invalide' })
          return
        }
        update = { role: value }
        break
      case 'set_quota':
        const quota = parseInt(String(value), 10)
        if (isNaN(quota) || quota < 0) {
          res.status(400).json({ error: 'Quota invalide' })
          return
        }
        update = { monthly_search_quota: quota }
        break
      default:
        res.status(400).json({ error: 'Action inconnue' })
        return
    }

    const { error } = await supabaseAdmin
      .from('profiles')
      .update(update)
      .eq('id', userId)

    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    // Journal admin
    await supabaseAdmin.from('audit_logs').insert({
      actor_id: auth!.userId,
      action: `admin_${action}`,
      metadata: { target_user: userId, value },
    })

    res.json({ ok: true })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    console.error('[admin/users] unhandled crash:', msg)
    res.status(500).json({ error: msg })
  }
}
