import Stripe from 'stripe'

if (!process.env.STRIPE_SECRET_KEY) {
  throw new Error('STRIPE_SECRET_KEY manquant dans .env')
}

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2025-02-24.acacia',
  typescript: true,
})

// ─── Catalogue de prix ───────────────────────────────────────────────────────
// IDs des prix Stripe (créés via le script sync-stripe-products.ts)
// À compléter après avoir lancé `npm run stripe:sync`

export interface PlanConfig {
  code:         string
  name:         string
  description:  string
  users:        number | null    // null = illimité
  searches:     number | null    // null = illimité
  features:     string[]
  pricing: {
    monthly:    { amount: number; priceId?: string }
    quarterly:  { amount: number; priceId?: string; saving: string }  // par mois
    annual:     { amount: number; priceId?: string; saving: string }  // par mois
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Stratégie tarifaire inspirée des meilleurs SaaS (HubSpot, Salesforce, Alan)
//   • Mensuel   : prix de référence
//   • Trimestriel : -15 % (1 mois offert → psychologie "j'essaie un trimestre")
//   • Annuel     : -20 % (~2,5 mois offerts → engagement fort, LTV maximale)
//
// Notes business :
//   • L'annuel = ~40 % des revenus chez les SaaS B2B matures (reduce churn)
//   • Le trimestriel capte les clients hésitants à s'engager 12 mois
//   • Mettre "Agence" en "Populaire" pousse vers un panier 2,5× le Solo
// ─────────────────────────────────────────────────────────────────────────────

export const PLANS: Record<string, PlanConfig> = {
  solo: {
    code:        'solo',
    name:        'Solo',
    description: 'Accès complet indépendant',
    users:       1,
    searches:    1500,
    features: [
      'Accès complet après validation',
      '1 500 recherches / mois',
      '1 utilisateur nominatif',
      'Coordonnées complètes',
      'Historique 90 jours',
      'Export PDF maîtrisé',
    ],
    pricing: {
      monthly:   { amount: 19900, priceId: 'price_1TdbAYQ1xoNYTIlA2mVk56fx' },   // 199 €
      quarterly: { amount: 16915, priceId: 'price_1TdbAYQ1xoNYTIlAFsUV6Mr5', saving: '–15 %  · 1 mois offert' },   // 169,15 € × 3 = 507,45 €
      annual:    { amount: 15920, priceId: 'price_1TdbAZQ1xoNYTIlAp36t2Hml', saving: '–20 %  · 2 mois offerts' },  // 159,20 € × 12 = 1 910,40 €
    },
  },

  agence: {
    code:        'agence',
    name:        'Agence',
    description: 'Offre équipe principale',
    users:       3,
    searches:    5000,
    features: [
      'Accès complet équipe',
      '5 000 recherches / mois',
      '3 comptes nominatifs',
      'Dashboard agence',
      'Exports CSV encadrés',
      'Historique 12 mois',
      "Logs d'utilisation",
      'Support prioritaire',
    ],
    pricing: {
      monthly:   { amount: 49900, priceId: 'price_1TdbAaQ1xoNYTIlAgI5gfyFw' },   // 499 €
      quarterly: { amount: 42415, priceId: 'price_1TdbAaQ1xoNYTIlAQMudC0vC', saving: '–15 %  · 1 mois offert' },   // 424,15 € × 3 = 1 272,45 €
      annual:    { amount: 39920, priceId: 'price_1TdbAbQ1xoNYTIlAU4Ykp1mp', saving: '–20 %  · 2 mois offerts' },  // 399,20 € × 12 = 4 790,40 €
    },
  },

  pro: {
    code:        'pro',
    name:        'Pro',
    description: 'Pour structures avancées',
    users:       7,
    searches:    12000,
    features: [
      'Accès complet multi-équipe',
      '12 000 recherches / mois',
      '7 comptes nominatifs',
      'Rôles agence / admin',
      'API disponible sur validation',
      'Intégrations CRM',
      "Audit d'usage avancé",
      'Support téléphonique',
    ],
    pricing: {
      monthly:   { amount: 89900, priceId: 'price_1TdbAcQ1xoNYTIlAo0UtvKRI' },   // 899 €
      quarterly: { amount: 76415, priceId: 'price_1TdbAcQ1xoNYTIlA8NZQHuyQ', saving: '–15 %  · 1 mois offert' },   // 764,15 € × 3 = 2 292,45 €
      annual:    { amount: 71920, priceId: 'price_1TdbAdQ1xoNYTIlAqbJf5lBD', saving: '–20 %  · 2 mois offerts' },  // 719,20 € × 12 = 8 630,40 €
    },
  },

  reseau: {
    code:        'reseau',
    name:        'Réseau',
    description: 'Sur mesure pour grands réseaux',
    users:       null,
    searches:    null,
    features: [
      'Multi-agences',
      'Volume personnalisé',
      'Infrastructure adaptée',
      'SSO / SAML',
      'Contrat dédié',
      'Accompagnement CSM',
    ],
    pricing: {
      monthly:   { amount: 0 },    // Sur devis
      quarterly: { amount: 0, saving: '' },
      annual:    { amount: 0, saving: '' },
    },
  },
}

// ─── Add-ons ─────────────────────────────────────────────────────────────────
export const ADDONS = {
  extra_searches_500: {
    name:        '+500 recherches',
    description: 'Pack de 500 recherches supplémentaires (valable 30 jours)',
    amount:      4900,  // 49 €
    priceId:     'price_1TdbAeQ1xoNYTIlAh872t8lb' as string | undefined,
  },
  extra_user: {
    name:        'Siège supplémentaire',
    description: 'Ajouter 1 utilisateur nominatif à ton plan',
    amount:      5900,  // 59 €/mois
    priceId:     'price_1TdbAfQ1xoNYTIlAp90XuKDR' as string | undefined,
  },
}

export type BillingPeriod = 'monthly' | 'quarterly' | 'annual'

export function getPriceId(planCode: string, period: BillingPeriod): string | undefined {
  return PLANS[planCode]?.pricing[period]?.priceId
}

export function getAmountInEuros(planCode: string, period: BillingPeriod): number {
  const cents = PLANS[planCode]?.pricing[period]?.amount ?? 0
  return cents / 100
}
