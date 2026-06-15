import { stripe } from './stripe.js'
import { supabaseAdmin } from './supabase.js'

/** Récupère le Stripe Customer lié à l'organisation, ou en crée un. */
export async function getOrCreateStripeCustomer(
  userId: string,
  organizationId: string,
  email: string,
): Promise<string> {
  const { data: existing } = await supabaseAdmin
    .from('subscriptions')
    .select('provider_customer_id')
    .eq('organization_id', organizationId)
    .eq('billing_provider', 'stripe')
    .not('provider_customer_id', 'is', null)
    .limit(1)
    .single()

  if (existing?.provider_customer_id) return existing.provider_customer_id

  const { data: org } = await supabaseAdmin
    .from('organizations')
    .select('legal_name, siren')
    .eq('id', organizationId)
    .single()

  const customer = await stripe.customers.create({
    email,
    name: org?.legal_name ?? 'Organisation',
    metadata: { organization_id: organizationId, user_id: userId, siren: org?.siren ?? '' },
  })

  return customer.id
}

export async function upsertSubscription(data: {
  organization_id: string
  plan_code: string
  status: string
  provider_customer_id: string
  provider_subscription_id: string
  starts_at: string
  renews_at: string | null
  canceled_at?: string | null
}) {
  await supabaseAdmin.from('subscriptions').upsert(
    {
      organization_id: data.organization_id,
      plan_code: data.plan_code,
      status: data.status,
      billing_provider: 'stripe',
      provider_customer_id: data.provider_customer_id,
      provider_subscription_id: data.provider_subscription_id,
      starts_at: data.starts_at,
      renews_at: data.renews_at,
      canceled_at: data.canceled_at ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: 'provider_subscription_id' },
  )
}
