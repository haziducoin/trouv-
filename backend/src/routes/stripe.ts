import { Router, Request, Response } from 'express'
import { z } from 'zod'
import { stripe, PLANS, ADDONS, type BillingPeriod } from '../config/stripe.js'
import { supabase } from '../config/supabase.js'
import { requireAuth } from '../middleware/auth.js'
import { sanitizeSubscriptionForClient } from '../privacy/sanitize.js'

const router = Router()

// ─── POST /api/stripe/checkout ───────────────────────────────────────────────
// Crée une session de paiement Stripe Checkout et retourne l'URL de redirection
router.post('/checkout', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    plan_code: z.enum(['solo', 'agence', 'pro']),
    period:    z.enum(['monthly', 'quarterly', 'annual']),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) {
    res.status(400).json({ error: 'Paramètres invalides', details: parsed.error.flatten() })
    return
  }

  const { plan_code, period } = parsed.data
  const plan = PLANS[plan_code]
  const priceId = plan.pricing[period as BillingPeriod].priceId

  if (!priceId) {
    res.status(503).json({
      error: 'Prix Stripe non encore configuré. Lance `npm run stripe:sync` d\'abord.',
      code:  'PRICE_NOT_SYNCED',
    })
    return
  }

  try {
    // Récupère ou crée le Stripe Customer lié à cette organisation
    const customerId = await getOrCreateStripeCustomer(req.userId!, req.organizationId!, req.userEmail!)

    const session = await stripe.checkout.sessions.create({
      mode:       'subscription',
      customer:   customerId,
      line_items: [{ price: priceId, quantity: 1 }],

      // Metadata pour le webhook
      subscription_data: {
        metadata: {
          organization_id: req.organizationId ?? '',
          plan_code,
          period,
        },
        // 14 jours d'essai gratuit pour les nouveaux clients
        trial_period_days: 14,
      },

      // Options de facturation
      billing_address_collection: 'required',
      tax_id_collection:          { enabled: true },  // TVA B2B
      automatic_tax:              { enabled: true },

      // URLs de redirection
      // Le frontend utilise ?success=true&plan=xxx comme route de succès (SPA sans serveur routing)
      success_url: process.env.STRIPE_SUCCESS_URL
        ?? `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/?success=true&plan=${plan_code}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  process.env.STRIPE_CANCEL_URL
        ?? `${process.env.FRONTEND_URL ?? 'http://localhost:3000'}/#tarifs`,

      // Permet les add-ons directement au checkout
      allow_promotion_codes: true,
    })

    res.json({ url: session.url, session_id: session.id })
  } catch (err: any) {
    console.error('[stripe/checkout]', err.message)
    res.status(500).json({ error: 'Erreur lors de la création de la session' })
  }
})

// ─── POST /api/stripe/portal ─────────────────────────────────────────────────
// Ouvre le portail de gestion Stripe (annulation, changement de plan, factures)
router.post('/portal', requireAuth, async (req: Request, res: Response): Promise<void> => {
  try {
    const { data: sub } = await supabase
      .from('subscriptions')
      .select('provider_customer_id')
      .eq('organization_id', req.organizationId)
      .eq('billing_provider', 'stripe')
      .single()

    if (!sub?.provider_customer_id) {
      res.status(404).json({ error: 'Aucun abonnement Stripe trouvé' })
      return
    }

    const session = await stripe.billingPortal.sessions.create({
      customer:   sub.provider_customer_id,
      return_url: process.env.STRIPE_PORTAL_RETURN_URL ?? `${process.env.FRONTEND_URL}/compte`,
    })

    res.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe/portal]', err.message)
    res.status(500).json({ error: 'Erreur portail Stripe' })
  }
})

// ─── POST /api/stripe/checkout/addon ─────────────────────────────────────────
// Acheter un add-on (pack de recherches, siège supplémentaire)
router.post('/checkout/addon', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const schema = z.object({
    addon: z.enum(['extra_searches_500', 'extra_user']),
  })

  const parsed = schema.safeParse(req.body)
  if (!parsed.success) { res.status(400).json({ error: 'Add-on invalide' }); return }

  const addon   = ADDONS[parsed.data.addon]
  if (!addon.priceId) {
    res.status(503).json({ error: 'Add-on non encore configuré', code: 'ADDON_NOT_SYNCED' })
    return
  }

  try {
    const customerId = await getOrCreateStripeCustomer(req.userId!, req.organizationId!, req.userEmail!)

    const session = await stripe.checkout.sessions.create({
      mode:       'payment',  // paiement unique
      customer:   customerId,
      line_items: [{ price: addon.priceId, quantity: 1 }],
      success_url: `${process.env.FRONTEND_URL}/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.FRONTEND_URL}/compte`,
      metadata:    { organization_id: req.organizationId ?? '', addon: parsed.data.addon },
    })

    res.json({ url: session.url })
  } catch (err: any) {
    console.error('[stripe/checkout/addon]', err.message)
    res.status(500).json({ error: 'Erreur add-on checkout' })
  }
})

// ─── GET /api/stripe/subscription ────────────────────────────────────────────
// Récupère l'abonnement actif de l'organisation
router.get('/subscription', requireAuth, async (req: Request, res: Response): Promise<void> => {
  const { data, error } = await supabase
    .from('subscriptions')
    .select('*, plans(*)')
    .eq('organization_id', req.organizationId)
    .in('status', ['trialing', 'active', 'past_due'])
    .order('created_at', { ascending: false })
    .limit(1)
    .single()

  if (error || !data) {
    res.json({ subscription: null })
    return
  }

  res.json({ subscription: sanitizeSubscriptionForClient(data) })
})

// ─── POST /api/stripe/webhook ─────────────────────────────────────────────────
// Webhook Stripe — reçoit tous les événements de facturation
// IMPORTANT : ce endpoint doit recevoir le body RAW (pas parsé en JSON)
router.post(
  '/webhook',
  async (req: Request, res: Response): Promise<void> => {
    const sig = req.headers['stripe-signature'] as string

    let event
    try {
      event = stripe.webhooks.constructEvent(
        req.body,   // Buffer raw (voir index.ts pour la config express)
        sig,
        process.env.STRIPE_WEBHOOK_SECRET ?? ''
      )
    } catch (err: any) {
      console.error('[webhook] Signature invalide:', err.message)
      res.status(400).json({ error: `Webhook Error: ${err.message}` })
      return
    }

    console.log(`[webhook] ${event.type}`)

    try {
      switch (event.type) {

        // ── Checkout complété (nouvel abonnement) ────────────────────────────
        case 'checkout.session.completed': {
          const session = event.data.object as any
          if (session.mode === 'subscription') {
            await handleCheckoutCompleted(session)
          } else if (session.mode === 'payment') {
            await handleAddonPurchased(session)
          }
          break
        }

        // ── Abonnement activé / renouvelé ─────────────────────────────────
        case 'customer.subscription.updated': {
          await handleSubscriptionUpdated(event.data.object as any)
          break
        }

        // ── Abonnement annulé ──────────────────────────────────────────────
        case 'customer.subscription.deleted': {
          await handleSubscriptionDeleted(event.data.object as any)
          break
        }

        // ── Facture payée (renouvellement) ─────────────────────────────────
        case 'invoice.payment_succeeded': {
          await handleInvoicePaid(event.data.object as any)
          break
        }

        // ── Paiement échoué ────────────────────────────────────────────────
        case 'invoice.payment_failed': {
          await handlePaymentFailed(event.data.object as any)
          break
        }

        // ── Essai gratuit terminé ──────────────────────────────────────────
        case 'customer.subscription.trial_will_end': {
          // TODO: envoyer un email de rappel J-3
          console.log('[webhook] Essai se termine dans 3 jours:', (event.data.object as any).id)
          break
        }

        default:
          // Événements non gérés ignorés silencieusement
      }
    } catch (err: any) {
      console.error(`[webhook] Erreur traitement ${event.type}:`, err.message)
      // On répond 200 quand même pour éviter que Stripe re-envoie indéfiniment
    }

    res.json({ received: true })
  }
)

// ═══════════════════════════════════════════════════════════════════════════════
// Handlers internes
// ═══════════════════════════════════════════════════════════════════════════════

async function handleCheckoutCompleted(session: any) {
  const { organization_id, plan_code, period } = session.subscription_data?.metadata ?? {}
  if (!organization_id) return

  const sub = await stripe.subscriptions.retrieve(session.subscription as string)

  await upsertSubscription({
    organization_id,
    plan_code:                 plan_code ?? 'solo',
    status:                    mapStripeStatus(sub.status),
    provider_customer_id:      session.customer as string,
    provider_subscription_id:  sub.id,
    starts_at:                 new Date(sub.start_date * 1000).toISOString(),
    renews_at:                 sub.current_period_end
                                ? new Date(sub.current_period_end * 1000).toISOString()
                                : null,
    period,
  })

  // Met à jour le quota mensuel selon le plan
  const quotas: Record<string, number> = { solo: 1500, agence: 5000, pro: 12000, reseau: 999999 }
  await supabase
    .from('profiles')
    .update({ monthly_search_quota: quotas[plan_code] ?? 1500 })
    .eq('organization_id', organization_id)
}

async function handleSubscriptionUpdated(sub: any) {
  const { organization_id, plan_code, period } = sub.metadata ?? {}

  await upsertSubscription({
    organization_id,
    plan_code:                plan_code ?? 'solo',
    status:                   mapStripeStatus(sub.status),
    provider_customer_id:     sub.customer as string,
    provider_subscription_id: sub.id,
    starts_at:                new Date(sub.start_date * 1000).toISOString(),
    renews_at:                sub.current_period_end
                               ? new Date(sub.current_period_end * 1000).toISOString()
                               : null,
    canceled_at:              sub.canceled_at
                               ? new Date(sub.canceled_at * 1000).toISOString()
                               : null,
    period,
  })
}

async function handleSubscriptionDeleted(sub: any) {
  await supabase
    .from('subscriptions')
    .update({
      status:      'canceled',
      canceled_at: new Date().toISOString(),
      updated_at:  new Date().toISOString(),
    })
    .eq('provider_subscription_id', sub.id)

  // Repasse les profils en quota free
  const { organization_id } = sub.metadata ?? {}
  if (organization_id) {
    await supabase
      .from('profiles')
      .update({ monthly_search_quota: 0 })
      .eq('organization_id', organization_id)
  }
}

async function handleInvoicePaid(invoice: any) {
  if (!invoice.subscription) return
  await supabase
    .from('subscriptions')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('provider_subscription_id', invoice.subscription)
}

async function handlePaymentFailed(invoice: any) {
  if (!invoice.subscription) return
  await supabase
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('provider_subscription_id', invoice.subscription)
  // TODO: envoyer email de relance
}

async function handleAddonPurchased(session: any) {
  const { organization_id, addon } = session.metadata ?? {}
  if (!organization_id || !addon) return

  if (addon === 'extra_searches_500') {
    // Ajoute 500 recherches au quota du mois en cours
    const { data: profiles } = await supabase
      .from('profiles')
      .select('id, monthly_search_quota')
      .eq('organization_id', organization_id)

    for (const p of profiles ?? []) {
      await supabase
        .from('profiles')
        .update({ monthly_search_quota: (p.monthly_search_quota ?? 0) + 500 })
        .eq('id', p.id)
    }
  }
  // TODO: gérer extra_user
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

async function getOrCreateStripeCustomer(
  userId: string,
  organizationId: string,
  email: string
): Promise<string> {
  // Vérifie si un customer Stripe existe déjà pour cette orga
  const { data: existing } = await supabase
    .from('subscriptions')
    .select('provider_customer_id')
    .eq('organization_id', organizationId)
    .eq('billing_provider', 'stripe')
    .not('provider_customer_id', 'is', null)
    .limit(1)
    .single()

  if (existing?.provider_customer_id) return existing.provider_customer_id

  // Récupère les infos de l'organisation pour le customer Stripe
  const { data: org } = await supabase
    .from('organizations')
    .select('legal_name, siren')
    .eq('id', organizationId)
    .single()

  const customer = await stripe.customers.create({
    email,
    name:     org?.legal_name ?? 'Organisation',
    metadata: {
      organization_id: organizationId,
      user_id:         userId,
      siren:           org?.siren ?? '',
    },
  })

  return customer.id
}

async function upsertSubscription(data: {
  organization_id:          string
  plan_code:                string
  status:                   string
  provider_customer_id:     string
  provider_subscription_id: string
  starts_at:                string
  renews_at:                string | null
  canceled_at?:             string | null
  period?:                  string
}) {
  await supabase
    .from('subscriptions')
    .upsert(
      {
        organization_id:           data.organization_id,
        plan_code:                 data.plan_code,
        status:                    data.status,
        billing_provider:          'stripe',
        provider_customer_id:      data.provider_customer_id,
        provider_subscription_id:  data.provider_subscription_id,
        starts_at:                 data.starts_at,
        renews_at:                 data.renews_at,
        canceled_at:               data.canceled_at ?? null,
        updated_at:                new Date().toISOString(),
      },
      { onConflict: 'provider_subscription_id' }
    )
}

function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active:            'active',
    trialing:          'trialing',
    past_due:          'past_due',
    canceled:          'canceled',
    unpaid:            'past_due',
    paused:            'paused',
    incomplete:        'trialing',
    incomplete_expired:'canceled',
  }
  return map[stripeStatus] ?? 'active'
}

export default router
