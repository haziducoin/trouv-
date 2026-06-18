import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, requireAdmin, supabaseAdmin } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') { res.status(405).json({ error: 'Method not allowed' }); return }

  const auth = await authenticate(req)
  const denied = requireAdmin(auth)
  if (denied) { res.status(denied.status).json({ error: denied.message }); return }

  const userId = req.query.userId as string
  if (!userId) { res.status(400).json({ error: 'userId requis' }); return }

  const [{ data: profile }, { data: searches }, { data: unlocks }] = await Promise.all([
    supabaseAdmin
      .from('profiles')
      .select('id, professional_email, first_name, last_name, function_title, role, access_status, monthly_search_quota, created_at, last_login_at, organizations(siren, legal_name), monthly_usage(period_start, searches_used)')
      .eq('id', userId)
      .single(),

    supabaseAdmin
      .from('searches')
      .select('id, query_label, filters, result_count, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),

    supabaseAdmin
      .from('contact_unlocks')
      .select('id, field_type, prospect_id, created_at')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50),
  ])

  res.json({ profile, searches: searches ?? [], unlocks: unlocks ?? [] })
}
