#!/usr/bin/env node
/**
 * scripts/setup-stripe-live.mjs
 * Crée les produits + prix (Solo/Agence/Pro × mensuel/trimestriel/annuel) et le webhook
 * sur le compte Stripe. Lit STRIPE_SECRET_KEY depuis .env.admin (jamais commité).
 *
 * Tarifs (HT, TVA ajoutée au checkout via automatic_tax) :
 *   Solo   : 199 / 169 / 159  €/mois (mensuel / trimestriel / annuel)
 *   Agence : 499 / 424 / 399
 *   Pro    : 899 / 764 / 719
 * Trimestriel = facturé tous les 3 mois (prix/mois × 3) ; annuel = facturé /an (prix/mois × 12).
 */
import Stripe from 'stripe'
import { readFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const env = {}
for (const line of readFileSync(resolve(root, '.env.admin'), 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.+)$/)
  if (m) env[m[1]] = m[2].trim()
}
const stripe = new Stripe(env.STRIPE_SECRET_KEY)
const FRONTEND = 'https://www.xn--trouv-fsa.fr'

const PLANS = [
  { code: 'solo',   name: 'Solo',   desc: 'Accès complet indépendant — 1 500 recherches / mois, 1 compte',
    prices: [['monthly', 19900, 'month', 1], ['quarterly', 50700, 'month', 3], ['annual', 190800, 'year', 1]] },
  { code: 'agence', name: 'Agence', desc: 'Offre équipe — 5 000 recherches / mois, 3 comptes',
    prices: [['monthly', 49900, 'month', 1], ['quarterly', 127200, 'month', 3], ['annual', 478800, 'year', 1]] },
  { code: 'pro',    name: 'Pro',    desc: 'Structures avancées — 12 000 recherches / mois, 7 comptes',
    prices: [['monthly', 89900, 'month', 1], ['quarterly', 229200, 'month', 3], ['annual', 862800, 'year', 1]] },
]

const result = {}

for (const p of PLANS) {
  const product = await stripe.products.create({
    name: `trouvé! ${p.name}`,
    description: p.desc,
    metadata: { plan_code: p.code },
  })
  console.log(`✅ Produit ${p.name} → ${product.id}`)
  for (const [period, amount, interval, count] of p.prices) {
    const price = await stripe.prices.create({
      product: product.id,
      currency: 'eur',
      unit_amount: amount,
      recurring: { interval, interval_count: count },
      tax_behavior: 'exclusive',
      nickname: `${p.name} ${period}`,
      metadata: { plan_code: p.code, period },
    })
    result[`${p.code}_${period}`] = price.id
    console.log(`   • ${period.padEnd(9)} ${(amount / 100).toFixed(2)} €  → ${price.id}`)
  }
}

// ─── Webhook ────────────────────────────────────────────────────────────────
const wh = await stripe.webhookEndpoints.create({
  url: `${FRONTEND}/api/stripe/webhook`,
  enabled_events: [
    'checkout.session.completed',
    'customer.subscription.updated',
    'customer.subscription.deleted',
    'invoice.payment_succeeded',
    'invoice.payment_failed',
    'customer.subscription.trial_will_end',
  ],
  description: 'trouvé! — abonnements',
})
console.log(`\n✅ Webhook → ${wh.id}`)
console.log(`   URL: ${wh.url}`)

console.log('\n────── PRICE IDS (pour le code) ──────')
console.log(JSON.stringify(result, null, 2))
console.log('\n⚠️  Le signing secret du webhook (whsec_…) NE PAS afficher ici.')
console.log('   Récupère-le dans Stripe → Developers → Webhooks → ce endpoint → "Signing secret" → Reveal')
console.log('   puis pose-le dans Vercel : STRIPE_WEBHOOK_SECRET')
