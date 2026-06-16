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
export type PlanCode = 'solo' | 'agence' | 'entreprise'

const env = process.env

// ─── Prix Stripe ───────────────────────────────────────────────────────────────
// Surchargeables par variable d'env (STRIPE_PRICE_<PLAN>_<PERIOD>).
// Les valeurs en dur sont les prix de TEST ; pour passer en live il suffit de
// poser les variables d'env correspondantes dans Vercel (aucun changement de code).
// Offres actuelles (cf. src/components/ui/pricing.tsx) : Solo 33€/mois (312€/an),
// Agence 79€/mois (756€/an). Entreprise = sur mesure (pas de prix Stripe, contact).
// Mensuel + annuel uniquement.
export const PLANS: Record<'solo' | 'agence', { pricing: Partial<Record<BillingPeriod, { priceId?: string }>> }> = {
  solo: {
    pricing: {
      monthly: { priceId: env.STRIPE_PRICE_SOLO_MONTHLY ?? 'price_1TizaqIWqycqHBP2JxyTW49l' },
      annual:  { priceId: env.STRIPE_PRICE_SOLO_ANNUAL  ?? 'price_1TizarIWqycqHBP2xLtnnudf' },
    },
  },
  agence: {
    pricing: {
      monthly: { priceId: env.STRIPE_PRICE_AGENCE_MONTHLY ?? 'price_1TizarIWqycqHBP2XwD02TvU' },
      annual:  { priceId: env.STRIPE_PRICE_AGENCE_ANNUAL  ?? 'price_1TizarIWqycqHBP2Im8W6fIT' },
    },
  },
}

// Recherches illimitées sur les offres payantes → quota très élevé.
export const PLAN_QUOTAS: Record<string, number> = {
  solo: 999999, agence: 999999, entreprise: 999999,
}

export function mapStripeStatus(stripeStatus: string): string {
  const map: Record<string, string> = {
    active: 'active', trialing: 'trialing', past_due: 'past_due',
    canceled: 'canceled', unpaid: 'past_due', paused: 'paused',
    incomplete: 'trialing', incomplete_expired: 'canceled',
  }
  return map[stripeStatus] ?? 'active'
}
