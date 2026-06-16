import type { VercelRequest, VercelResponse } from '@vercel/node'
import { stripe, PLANS, type BillingPeriod } from '../_lib/stripe.js'
import { authenticate } from '../_lib/supabase.js'
import { getOrCreateStripeCustomer } from '../_lib/subscriptions.js'

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
  if (!auth.organizationId) {
    res.status(403).json({ error: 'Aucune organisation associée à ce compte.' })
    return
  }

  const planCode = req.body?.plan_code as string
  const period = (req.body?.period ?? 'monthly') as BillingPeriod

  if (!['solo', 'agence'].includes(planCode)) {
    res.status(400).json({ error: "Ce plan n'est pas disponible à l'abonnement en ligne. Contactez-nous." })
    return
  }
  if (!['monthly', 'annual'].includes(period)) {
    res.status(400).json({ error: 'Période invalide' })
    return
  }

  const priceId = PLANS[planCode as 'solo' | 'agence'].pricing[period]?.priceId
  if (!priceId) {
    res.status(503).json({ error: 'Prix Stripe non configuré pour ce plan.', code: 'PRICE_NOT_SYNCED' })
    return
  }

  try {
    const customerId = await getOrCreateStripeCustomer(auth.userId, auth.organizationId, auth.email)

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: {
        metadata: { organization_id: auth.organizationId, plan_code: planCode, period },
      },
      billing_address_collection: 'required',
      tax_id_collection: { enabled: true },
      automatic_tax: { enabled: true },
      allow_promotion_codes: true,
      success_url:
        process.env.STRIPE_SUCCESS_URL ??
        `${FRONTEND_URL}/?success=true&plan=${planCode}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: process.env.STRIPE_CANCEL_URL ?? `${FRONTEND_URL}/#tarifs`,
    })

    res.json({ url: session.url, session_id: session.id })
  } catch (err: any) {
    console.error('[stripe/checkout]', err?.message)
    res.status(500).json({ error: 'Erreur lors de la création de la session de paiement.' })
  }
}
