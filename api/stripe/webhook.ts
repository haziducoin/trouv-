import type { VercelRequest, VercelResponse } from '@vercel/node'
import { stripe, mapStripeStatus, PLAN_QUOTAS } from '../_lib/stripe.js'
import { supabaseAdmin } from '../_lib/supabase.js'
import { upsertSubscription } from '../_lib/subscriptions.js'

// Le webhook Stripe a besoin du body BRUT pour vérifier la signature.
export const config = { api: { bodyParser: false } }

async function rawBody(req: VercelRequest): Promise<Buffer> {
  const chunks: Buffer[] = []
  for await (const chunk of req) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  }
  return Buffer.concat(chunks)
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const sig = req.headers['stripe-signature'] as string
  const secret = process.env.STRIPE_WEBHOOK_SECRET ?? ''

  let event: any
  try {
    const buf = await rawBody(req)
    event = stripe.webhooks.constructEvent(buf, sig, secret)
  } catch (err: any) {
    console.error('[webhook] Signature invalide:', err?.message)
    res.status(400).json({ error: `Webhook Error: ${err?.message}` })
    return
  }

  console.log(`[webhook] ${event.type}`)

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object
        if (session.mode === 'subscription') await handleCheckoutCompleted(session)
        else if (session.mode === 'payment') await handleAddonPurchased(session)
        break
      }
      case 'customer.subscription.updated':
        await handleSubscriptionUpdated(event.data.object)
        break
      case 'customer.subscription.deleted':
        await handleSubscriptionDeleted(event.data.object)
        break
      case 'invoice.payment_succeeded':
        await handleInvoicePaid(event.data.object)
        break
      case 'invoice.payment_failed':
        await handlePaymentFailed(event.data.object)
        break
      case 'customer.subscription.trial_will_end':
        console.log('[webhook] Essai se termine dans 3 jours:', event.data.object.id)
        break
      default:
        break
    }
  } catch (err: any) {
    console.error(`[webhook] Erreur traitement ${event.type}:`, err?.message)
    // On répond 200 quand même pour éviter les retries infinis de Stripe.
  }

  res.json({ received: true })
}

// ─── Handlers ────────────────────────────────────────────────────────────────

async function handleCheckoutCompleted(session: any) {
  const { organization_id, plan_code, period } = session.subscription_data?.metadata ?? session.metadata ?? {}
  if (!organization_id) return

  const sub: any = await stripe.subscriptions.retrieve(session.subscription as string)

  await upsertSubscription({
    organization_id,
    plan_code: plan_code ?? 'solo',
    status: mapStripeStatus(sub.status),
    provider_customer_id: session.customer as string,
    provider_subscription_id: sub.id,
    starts_at: sub.start_date ? new Date(sub.start_date * 1000).toISOString() : new Date().toISOString(),
    renews_at: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
  })

  await supabaseAdmin
    .from('profiles')
    .update({ monthly_search_quota: PLAN_QUOTAS[plan_code] ?? 999999 })
    .eq('organization_id', organization_id)

  // Octroi des crédits téléphone / email selon l'offre.
  await supabaseAdmin.rpc('grant_plan_credits', { p_org_id: organization_id, p_plan_code: plan_code ?? 'solo' })
  void period
}

async function handleSubscriptionUpdated(sub: any) {
  const { organization_id, plan_code } = sub.metadata ?? {}
  if (!organization_id) return

  await upsertSubscription({
    organization_id,
    plan_code: plan_code ?? 'solo',
    status: mapStripeStatus(sub.status),
    provider_customer_id: sub.customer as string,
    provider_subscription_id: sub.id,
    starts_at: sub.start_date ? new Date(sub.start_date * 1000).toISOString() : new Date().toISOString(),
    renews_at: sub.current_period_end ? new Date(sub.current_period_end * 1000).toISOString() : null,
    canceled_at: sub.canceled_at ? new Date(sub.canceled_at * 1000).toISOString() : null,
  })

  // Réaligne les crédits sur l'offre (changement de plan inclus).
  if (mapStripeStatus(sub.status) === 'active' || mapStripeStatus(sub.status) === 'trialing') {
    await supabaseAdmin.rpc('grant_plan_credits', { p_org_id: organization_id, p_plan_code: plan_code ?? 'solo' })
  }
}

async function handleSubscriptionDeleted(sub: any) {
  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'canceled', canceled_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('provider_subscription_id', sub.id)

  const { organization_id } = sub.metadata ?? {}
  if (organization_id) {
    await supabaseAdmin.from('profiles').update({ monthly_search_quota: 0 }).eq('organization_id', organization_id)
    // Crédits remis à zéro (offre annulée).
    await supabaseAdmin.rpc('grant_plan_credits', { p_org_id: organization_id, p_plan_code: 'canceled' })
  }
}

async function handleInvoicePaid(invoice: any) {
  if (!invoice.subscription) return
  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'active', updated_at: new Date().toISOString() })
    .eq('provider_subscription_id', invoice.subscription)

  // Recharge mensuelle des crédits selon l'offre.
  const { data: sub } = await supabaseAdmin
    .from('subscriptions')
    .select('organization_id, plan_code')
    .eq('provider_subscription_id', invoice.subscription)
    .single()
  if (sub?.organization_id) {
    await supabaseAdmin.rpc('grant_plan_credits', { p_org_id: sub.organization_id, p_plan_code: sub.plan_code ?? 'solo' })
  }
}

async function handlePaymentFailed(invoice: any) {
  if (!invoice.subscription) return
  await supabaseAdmin
    .from('subscriptions')
    .update({ status: 'past_due', updated_at: new Date().toISOString() })
    .eq('provider_subscription_id', invoice.subscription)
}

async function handleAddonPurchased(session: any) {
  const { organization_id, addon } = session.metadata ?? {}
  if (!organization_id || !addon) return

  if (addon === 'extra_searches_500') {
    const { data: profiles } = await supabaseAdmin
      .from('profiles')
      .select('id, monthly_search_quota')
      .eq('organization_id', organization_id)

    for (const p of profiles ?? []) {
      await supabaseAdmin
        .from('profiles')
        .update({ monthly_search_quota: (p.monthly_search_quota ?? 0) + 500 })
        .eq('id', p.id)
    }
  }
}
