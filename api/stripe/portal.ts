import type { VercelRequest, VercelResponse } from '@vercel/node'
import { stripe } from '../_lib/stripe.js'
import { authenticate, supabaseAdmin } from '../_lib/supabase.js'

const FRONTEND_URL = process.env.FRONTEND_URL ?? 'https://www.xn--trouv-fsa.fr'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await authenticate(req)
  if (!auth) {
    res.status(401).json({ error: 'Authentification requise' })
    return
  }

  try {
    const { data: sub } = await supabaseAdmin
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('organization_id', auth.organizationId)
      .eq('billing_provider', 'stripe')
      .single()

    if (!sub?.provider_customer_id) {
      res.status(404).json({ error: 'Aucun abonnement Stripe trouvé.' })
      return
    }

    const session = await stripe.billingPortal.sessions.create({
      customer: sub.provider_customer_id,
      return_url: process.env.STRIPE_PORTAL_RETURN_URL ?? `${FRONTEND_URL}/compte`,
    })

    res.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe/portal]', err?.message)
    res.status(500).json({ error: 'Erreur portail Stripe.' })
  }
}
