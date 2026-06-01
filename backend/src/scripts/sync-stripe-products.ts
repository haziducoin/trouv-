/**
 * sync-stripe-products.ts
 *
 * Crée (ou retrouve) tous les produits et prix Stripe pour trouvé!
 * Lance avec : npm run stripe:sync
 *
 * Ce script est IDEMPOTENT : il peut être relancé sans créer de doublons
 * (il cherche par metadata avant de créer)
 */

import 'dotenv/config'
import Stripe from 'stripe'
import { PLANS, ADDONS } from '../config/stripe.js'

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY ?? '', { apiVersion: '2025-02-24.acacia' })

// Périodes → configuration Stripe
const PERIOD_CONFIG: Record<string, { interval: Stripe.PriceCreateParams.Recurring.Interval; interval_count: number; label: string }> = {
  monthly:   { interval: 'month', interval_count: 1,  label: 'Mensuel'      },
  quarterly: { interval: 'month', interval_count: 3,  label: 'Trimestriel'  },
  annual:    { interval: 'year',  interval_count: 1,  label: 'Annuel'       },
}

async function findOrCreateProduct(planCode: string, planName: string, description: string): Promise<string> {
  // Cherche un produit existant avec ce metadata
  const existing = await stripe.products.list({ limit: 100 })
  const found = existing.data.find(p => p.metadata?.trouve_plan === planCode && p.active)
  if (found) {
    console.log(`  ↩ Produit existant : ${found.id} (${found.name})`)
    return found.id
  }

  const product = await stripe.products.create({
    name:        `trouvé! ${planName}`,
    description,
    metadata:    { trouve_plan: planCode },
    images:      [],
  })

  console.log(`  ✅ Produit créé : ${product.id} (${product.name})`)
  return product.id
}

async function findOrCreatePrice(
  productId:    string,
  planCode:     string,
  period:       string,
  amountCents:  number,
  interval:     Stripe.PriceCreateParams.Recurring.Interval,
  intervalCount: number,
  label:        string,
): Promise<string> {
  const existing = await stripe.prices.list({ product: productId, limit: 100 })
  const found = existing.data.find(p =>
    p.metadata?.trouve_plan === planCode &&
    p.metadata?.trouve_period === period &&
    p.active
  )

  if (found) {
    console.log(`    ↩ Prix existant ${period} : ${found.id} (${(found.unit_amount ?? 0) / 100}€)`)
    return found.id
  }

  const price = await stripe.prices.create({
    product:     productId,
    unit_amount: amountCents,
    currency:    'eur',
    recurring:   { interval, interval_count: intervalCount },
    nickname:    `trouvé! ${planCode} — ${label}`,
    metadata:    { trouve_plan: planCode, trouve_period: period },
  })

  console.log(`    ✅ Prix créé ${period} : ${price.id} (${(price.unit_amount ?? 0) / 100}€/${period})`)
  return price.id
}

async function syncAddons() {
  console.log('\n─── Add-ons ───────────────────────────────────────────')

  for (const [addonKey, addon] of Object.entries(ADDONS)) {
    console.log(`\n📦 ${addon.name}`)

    const existing = await stripe.products.list({ limit: 100 })
    let product = existing.data.find(p => p.metadata?.trouve_addon === addonKey && p.active)

    if (!product) {
      product = await stripe.products.create({
        name:     addon.name,
        description: addon.description,
        metadata: { trouve_addon: addonKey },
      })
      console.log(`  ✅ Produit add-on créé : ${product.id}`)
    } else {
      console.log(`  ↩ Produit add-on existant : ${product.id}`)
    }

    const prices = await stripe.prices.list({ product: product.id, limit: 100 })
    let price = prices.data.find(p => p.active && !p.recurring)

    if (!price) {
      price = await stripe.prices.create({
        product:    product.id,
        unit_amount: addon.amount,
        currency:   'eur',
        nickname:   addon.name,
        metadata:   { trouve_addon: addonKey },
      })
      console.log(`  ✅ Prix add-on créé : ${price.id}`)
    } else {
      console.log(`  ↩ Prix add-on existant : ${price.id}`)
    }

    // Affiche l'ID à mettre dans config/stripe.ts
    console.log(`  → ADDONS.${addonKey}.priceId = "${price.id}"`)
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('🔄 Synchronisation des produits Stripe pour trouvé!\n')
  console.log(`Mode : ${process.env.STRIPE_SECRET_KEY?.startsWith('sk_live') ? '🔴 PRODUCTION' : '🟡 TEST'}\n`)

  const priceIds: Record<string, Record<string, string>> = {}
  const productIds: Record<string, string> = {}

  for (const [planCode, plan] of Object.entries(PLANS)) {
    if (planCode === 'reseau') continue  // Sur devis, pas de produit Stripe

    console.log(`\n─── Plan ${plan.name} ─────────────────────────────────────`)
    const productId = await findOrCreateProduct(planCode, plan.name, plan.description)
    productIds[planCode] = productId

    priceIds[planCode] = {}

    for (const [period, config] of Object.entries(PERIOD_CONFIG)) {
      const amount = plan.pricing[period as keyof typeof plan.pricing]?.amount
      if (!amount) continue

      const priceId = await findOrCreatePrice(
        productId, planCode, period, amount,
        config.interval, config.interval_count, config.label
      )
      priceIds[planCode][period] = priceId
    }
  }

  await syncAddons()

  // ─── Affiche le code à copier dans config/stripe.ts ────────────────────────
  console.log('\n\n══════════════════════════════════════════════════════════')
  console.log('✅ COPIE CES priceId DANS src/config/stripe.ts')
  console.log('══════════════════════════════════════════════════════════\n')

  for (const [planCode, periods] of Object.entries(priceIds)) {
    console.log(`// ${planCode}`)
    for (const [period, priceId] of Object.entries(periods)) {
      console.log(`PLANS.${planCode}.pricing.${period}.priceId = '${priceId}'`)
    }
    console.log()
  }

  // ─── Configure aussi le Customer Portal ─────────────────────────────────
  console.log('Configuration du Customer Portal...')
  try {
    await stripe.billingPortal.configurations.create({
      business_profile: {
        headline:     'Gérer votre abonnement trouvé!',
        privacy_policy_url: `${process.env.FRONTEND_URL}/confidentialite`,
        terms_of_service_url: `${process.env.FRONTEND_URL}/cgu`,
      },
      features: {
        payment_method_update:    { enabled: true },
        subscription_cancel:      { enabled: true, mode: 'at_period_end', cancellation_reason: { enabled: true, options: ['too_expensive', 'missing_features', 'switched_service', 'unused', 'other'] } },
        subscription_update: {
          enabled:   true,
          proration_behavior: 'always_invoice',
          default_allowed_updates: ['price', 'quantity'],
          products: Object.entries(priceIds).map(([planCode, periods]) => ({
            product: productIds[planCode],
            prices: Object.values(periods),
          })).filter(p => p.product && p.prices.length > 0),
        },
        invoice_history:          { enabled: true },
      },
    })
    console.log('✅ Customer Portal configuré')
  } catch (err: any) {
    console.log('⚠️  Customer Portal déjà configuré ou erreur:', err.message)
  }
}

main().catch(console.error)
