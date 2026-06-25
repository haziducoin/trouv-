import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, requireAdmin, supabaseAdmin } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
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
    const status = req.query.status as string | undefined   // pending | approved | blocked
    const search = req.query.search as string | undefined   // email/nom partiel

    let query = supabaseAdmin
      .from('profiles')
      .select(`
        id,
        professional_email,
        first_name,
        last_name,
        function_title,
        role,
        access_status,
        monthly_search_quota,
        created_at,
        last_login_at,
        cgu_accepted,
        organizations!profiles_organization_id_fkey ( siren, legal_name, legal_form, administrative_status ),
        monthly_usage ( period_start, searches_used )
      `, { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * limit, page * limit - 1)

    if (status) query = query.eq('access_status', status)
    if (search) query = query.or(
      `professional_email.ilike.%${search}%,first_name.ilike.%${search}%,last_name.ilike.%${search}%`
    )

    const { data, error, count } = await query
    if (error) {
      res.status(500).json({ error: error.message })
      return
    }

    res.json({
      users: (data ?? []).map((u: Record<string, unknown>) => {
        const org = u.organizations as Record<string, unknown> | null
        const usage = (u.monthly_usage as Array<{ period_start: string; searches_used: number }> | null) ?? []
        // Dernière période connue
        const currentUsage = usage.sort((a, b) =>
          b.period_start.localeCompare(a.period_start)
        )[0]
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
            legalForm: org.legal_form,
            active: org.administrative_status === 'A',
          } : null,
          monthlyUsage: currentUsage?.searches_used ?? 0,
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
}
