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
    description: 'Pour les agents indépendants',
    users:       1,
    searches:    1500,
    features: [
      '1 500 recherches / mois',
      '1 utilisateur nominatif',
      'Export PDF des résultats',
      'Historique 90 jours',
      'Support email',
    ],
    pricing: {
      monthly:   { amount: 19900 },   // 199 €
      quarterly: { amount: 16915, saving: '–15 %  · 1 mois offert' },   // 169,15 € × 3 = 507,45 €
      annual:    { amount: 15920, saving: '–20 %  · 2 mois offerts' },  // 159,20 € × 12 = 1 910,40 €
    },
  },

  agence: {
    code:        'agence',
    name:        'Agence',
    description: 'Pour les agences immobilières',
    users:       3,
    searches:    5000,
    features: [
      '5 000 recherches / mois',
      '3 comptes nominatifs',
      'Dashboard agence + statistiques',
      'Export illimité en CSV',
      'Historique 12 mois',
      'Support prioritaire',
      'Onboarding dédié',
    ],
    pricing: {
      monthly:   { amount: 49900 },   // 499 €
      quarterly: { amount: 42415, saving: '–15 %  · 1 mois offert' },   // 424,15 € × 3 = 1 272,45 €
      annual:    { amount: 39920, saving: '–20 %  · 2 mois offerts' },  // 399,20 € × 12 = 4 790,40 €
    },
  },

  pro: {
    code:        'pro',
    name:        'Pro',
    description: 'Pour les structures multi-équipes',
    users:       7,
    searches:    12000,
    features: [
      '12 000 recherches / mois',
      '7 comptes nominatifs',
      'Multi-agence (1 réseau)',
      'API REST incluse',
      'Intégrations CRM (Salesforce, HubSpot)',
      'Rapports avancés',
      'SLA 99,9 %',
      'Support téléphonique',
    ],
    pricing: {
      monthly:   { amount: 89900 },   // 899 €
      quarterly: { amount: 76415, saving: '–15 %  · 1 mois offert' },   // 764,15 € × 3 = 2 292,45 €
      annual:    { amount: 71920, saving: '–20 %  · 2 mois offerts' },  // 719,20 € × 12 = 8 630,40 €
    },
  },

  reseau: {
    code:        'reseau',
    name:        'Réseau',
    description: 'Tarification sur mesure pour les grands réseaux',
    users:       null,
    searches:    null,
    features: [
      'Utilisateurs illimités',
      'Volume de recherches adapté',
      'Infrastructure dédiée',
      'SSO / SAML',
      'Contrat personnalisé & facturation annuelle',
      'CSM dédié',
      'SLA enterprise garanti',
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
    priceId:     undefined as string | undefined,
  },
  extra_user: {
    name:        'Siège supplémentaire',
    description: 'Ajouter 1 utilisateur nominatif à ton plan',
    amount:      5900,  // 59 €/mois
    priceId:     undefined as string | undefined,
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
