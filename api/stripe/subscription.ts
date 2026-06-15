import type { VercelRequest, VercelResponse } from '@vercel/node'
import { authenticate, supabaseAdmin } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await authenticate(req)
  if (!auth) {
    res.status(401).json({ error: 'Authentification requise' })
    return
  }

  const { data, error } = await supabaseAdmin
    .from('subscriptions')
    .select('status, plan_code, renews_at, starts_at, canceled_at')
    .eq('organization_id', auth.organizationId)
    .in('status', ['trialing', 'active', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    res.json({ subscription: null })
    return
  }

  res.json({
    subscription: {
      status: data.status ?? null,
      planCode: data.plan_code ?? null,
      renewsAt: data.renews_at ?? null,
      startsAt: data.starts_at ?? null,
      canceledAt: data.canceled_at ?? null,
    },
  })
}
