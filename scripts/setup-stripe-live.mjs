#!/usr/bin/env node
/**
 * scripts/setup-stripe-live.mjs
 * Aligne le catalogue Stripe sur les offres ACTUELLES du site (src/components/ui/pricing.tsx) :
 *   Solo   : 33 €/mois  ·  312 €/an  (26 €/mois en annuel)
 *   Agence : 79 €/mois  ·  756 €/an  (63 €/mois en annuel)
 *   Entreprise : sur mesure (pas de prix Stripe — contact)
 * Mensuel + annuel uniquement. Prix HT (TVA ajoutée au checkout via automatic_tax).
 *
 * Archive d'abord les produits trouvé! existants (catalogue erroné), puis recrée les bons.
 * Lit STRIPE_SECRET_KEY depuis .env.admin (jamais commité).
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

// ─── 1. Archiver les anciens produits trouvé! (catalogue erroné) ─────────────
const existing = await stripe.products.list({ limit: 100, active: true })
for (const prod of existing.data) {
  if (prod.name?.startsWith('trouvé!')) {
    await stripe.products.update(prod.id, { active: false })
    console.log(`🗑️  Archivé : ${prod.name} (${prod.id})`)
  }
}

// ─── 2. Créer les bons produits/prix ─────────────────────────────────────────
const PLANS = [
  { code: 'solo',   name: 'Solo',   desc: 'Prospection individuelle — recherches illimitées, 1 compte',
    prices: [['monthly', 3300, 'month', 1], ['annual', 31200, 'year', 1]] },
  { code: 'agence', name: 'Agence', desc: 'Prospection ciblée et intensive — équipe, export CSV',
    prices: [['monthly', 7900, 'month', 1], ['annual', 75600, 'year', 1]] },
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
    console.log(`   • ${period.padEnd(8)} ${(amount / 100).toFixed(2)} €  → ${price.id}`)
  }
}

console.log('\n────── PRICE IDS (pour le code) ──────')
console.log(JSON.stringify(result, null, 2))
