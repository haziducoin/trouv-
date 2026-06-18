import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, requireAdmin, supabaseAdmin } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const auth = await authenticate(req)
  const denied = requireAdmin(auth)
  if (denied) { res.status(denied.status).json({ error: denied.message }); return }

  const limit = Math.min(200, parseInt(String(req.query.limit ?? '100'), 10))
  const action = req.query.action as string | undefined

  let query = supabaseAdmin
    .from('audit_logs')
    .select('id, action, actor_id, metadata, created_at, profiles!audit_logs_actor_id_fkey(professional_email)')
    .order('created_at', { ascending: false })
    .limit(limit)

  if (action) query = query.eq('action', action)

  const { data, error } = await query
  if (error) { res.status(500).json({ error: error.message }); return }

  // Agrégats santé système
  const now = new Date()
  const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000).toISOString()

  const [{ count: searchesToday }, { count: unlocksToday }, { count: errorsToday }] = await Promise.all([
    supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true })
      .eq('action', 'search').gte('created_at', last24h),
    supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true })
      .eq('action', 'unlock').gte('created_at', last24h),
    supabaseAdmin.from('audit_logs').select('*', { count: 'exact', head: true })
      .ilike('action', '%error%').gte('created_at', last24h),
  ])

  res.json({
    logs: (data ?? []).map((l: Record<string, unknown>) => ({
      id: l.id,
      action: l.action,
      actorEmail: (l.profiles as Record<string, unknown> | null)?.professional_email ?? l.actor_id,
      metadata: l.metadata,
      createdAt: l.created_at,
    })),
    health: {
      searchesToday: searchesToday ?? 0,
      unlocksToday: unlocksToday ?? 0,
      errorsToday: errorsToday ?? 0,
    },
  })
}
