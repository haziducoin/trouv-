import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, requireAdmin, supabaseAdmin } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await authenticate(req)
  const denied = requireAdmin(auth)
  if (denied) {
    res.status(denied.status).json({ error: denied.message })
    return
  }

  const now = new Date()
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString()
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
    // Total comptes approuvés
    supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('access_status', 'approved'),

    // Nouveaux comptes ce mois
    supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', startOfMonth),

    // En attente de validation
    supabaseAdmin
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('access_status', 'pending'),

    // Recherches ce mois (audit_logs)
    supabaseAdmin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'search')
      .gte('created_at', startOfMonth),

    // Déblocages ce mois
    supabaseAdmin
      .from('audit_logs')
      .select('*', { count: 'exact', head: true })
      .eq('action', 'unlock')
      .gte('created_at', startOfMonth),

    // Top 10 orgs par nombre de recherches ce mois
    supabaseAdmin
      .from('monthly_usage')
      .select('organization_id, searches_used, organizations(name)')
      .gte('period_start', startOfMonth)
      .order('searches_used', { ascending: false })
      .limit(10),

    // 20 dernières recherches (tous users)
    supabaseAdmin
      .from('searches')
      .select('id, query_label, filters, result_count, created_at, profiles(email)')
      .order('created_at', { ascending: false })
      .limit(20),

    // Crédits consommés ce mois vs mois dernier
    supabaseAdmin
      .from('contact_unlocks')
      .select('field_type, created_at')
      .gte('created_at', startOfLastMonth),
  ])

  // Calcul crédits mois courant vs mois précédent
  const creditsThisMonth = (creditUsage ?? []).filter(
    (u: { created_at: string }) => u.created_at >= startOfMonth
  )
  const creditsLastMonth = (creditUsage ?? []).filter(
    (u: { created_at: string }) => u.created_at < startOfMonth
  )

  res.json({
    users: {
      total: totalUsers ?? 0,
      newThisMonth: newUsersThisMonth ?? 0,
      pendingApprovals: pendingApprovals ?? 0,
    },
    activity: {
      searchesThisMonth: searchesThisMonth ?? 0,
      unlocksThisMonth: unlocksThisMonth ?? 0,
    },
    credits: {
      thisMonth: creditsThisMonth.length,
      lastMonth: creditsLastMonth.length,
      byType: {
        phone: creditsThisMonth.filter((u: { field_type: string }) => u.field_type === 'phone').length,
        email: creditsThisMonth.filter((u: { field_type: string }) => u.field_type === 'email').length,
      },
    },
    topOrgs: (topOrgs ?? []).map((o: Record<string, unknown>) => ({
      organizationId: o.organization_id,
      name: (o.organizations as Record<string, unknown> | null)?.name ?? '—',
      searchesUsed: o.searches_used,
    })),
    recentSearches: (recentSearches ?? []).map((s: Record<string, unknown>) => ({
      id: s.id,
      queryLabel: s.query_label,
      filters: s.filters,
      resultCount: s.result_count,
      createdAt: s.created_at,
      userEmail: (s.profiles as Record<string, unknown> | null)?.email ?? '—',
    })),
  })
}
