import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY manquant (Vercel env)')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  // Cast : on fige une version d'API connue, indépendamment de la version du SDK.
  apiVersion: '2025-02-24.acacia' as any,
  typescript: true,
})

export type BillingPeriod = 'monthly' | 'quarterly' | 'annual'
export type PlanCode = 'solo' | 'agence' | 'pro' | 'reseau'

const env = process.env

// ─── Prix Stripe ───────────────────────────────────────────────────────────────
// Surchargeables par variable d'env (STRIPE_PRICE_<PLAN>_<PERIOD>).
// Les valeurs en dur sont les prix de TEST ; pour passer en live il suffit de
// poser les variables d'env correspondantes dans Vercel (aucun changement de code).
export const PLANS: Record<Exclude<PlanCode, 'reseau'>, { pricing: Record<BillingPeriod, { priceId?: string }> }> = {
  solo: {
    pricing: {
      monthly:   { priceId: env.STRIPE_PRICE_SOLO_MONTHLY   ?? 'price_1TdbAYQ1xoNYTIlA2mVk56fx' },
      quarterly: { priceId: env.STRIPE_PRICE_SOLO_QUARTERLY ?? 'price_1TdbAYQ1xoNYTIlAFsUV6Mr5' },
      annual:    { priceId: env.STRIPE_PRICE_SOLO_ANNUAL    ?? 'price_1TdbAZQ1xoNYTIlAp36t2Hml' },
    },
  },
  agence: {
    pricing: {
      monthly:   { priceId: env.STRIPE_PRICE_AGENCE_MONTHLY   ?? 'price_1TdbAaQ1xoNYTIlAgI5gfyFw' },
      quarterly: { priceId: env.STRIPE_PRICE_AGENCE_QUARTERLY ?? 'price_1TdbAaQ1xoNYTIlAQMudC0vC' },
      annual:    { priceId: env.STRIPE_PRICE_AGENCE_ANNUAL    ?? 'price_1TdbAbQ1xoNYTIlAU4Ykp1mp' },
    },
  },
  pro: {
    pricing: {
      monthly:   { priceId: env.STRIPE_PRICE_PRO_MONTHLY   ?? 'price_1TdbAcQ1xoNYTIlAo0UtvKRI' },
      quarterly: { priceId: env.STRIPE_PRICE_PRO_QUARTERLY ?? 'price_1TdbAcQ1xoNYTIlA8NZQHuyQ' },
      annual:    { priceId: env.STRIPE_PRICE_PRO_ANNUAL    ?? 'price_1TdbAdQ1xoNYTIlAqbJf5lBD' },
    },
  },
}

export const ADDONS: Record<string, { priceId?: string }> = {
  extra_searches_500: { priceId: env.STRIPE_PRICE_ADDON_SEARCHES ?? 'price_1TdbAeQ1xoNYTIlAh872t8lb' },
  extra_user:         { priceId: env.STRIPE_PRICE_ADDON_USER     ?? 'price_1TdbAfQ1xoNYTIlAp90XuKDR' },
}

export const PLAN_QUOTAS: Record<string, number> = {
  solo: 1500, agence: 5000, pro: 12000, reseau: 999999,
}

export function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active: 'active', trialing: 'trialing', past_due: 'past_due',
    canceled: 'canceled', unpaid: 'past_due', paused: 'paused',
    incomplete: 'trialing', incomplete_expired: 'canceled',
  }
  return map[stripeStatus] ?? 'active'
}
