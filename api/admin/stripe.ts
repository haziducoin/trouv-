import type { VercelRequest, VercelResponse } from '@vercel/node'
import { stripe } from '../_lib/stripe.js'
import { authenticate, requireAdmin } from '../_lib/supabase.js'

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const auth = await authenticate(req)
  const denied = requireAdmin(auth)
  if (denied) {
    res.status(denied.status).json({ error: denied.message })
    return
  }

  const now = new Date()
  const startOfMonth = Math.floor(new Date(now.getFullYear(), now.getMonth(), 1).getTime() / 1000)
  const startOfLastMonth = Math.floor(new Date(now.getFullYear(), now.getMonth() - 1, 1).getTime() / 1000)
  const endOfLastMonth = startOfMonth - 1

  const [mrrResult, recentCharges, subsResult] = await Promise.all([
    // Abonnements actifs pour MRR
    stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.items.data.price'],
    }),

    // 20 derniers paiements réussis
    stripe.charges.list({
      limit: 20,
      created: { gte: startOfMonth },
    }),

    // Abonnements créés ce mois et mois dernier (pour tendance)
    stripe.subscriptions.list({
      status: 'all',
      limit: 100,
      created: { gte: startOfLastMonth },
    }),
  ])

  // MRR = somme des montants mensuels des abonnements actifs
  let mrrCents = 0
  for (const sub of mrrResult.data) {
    for (const item of sub.items.data) {
      const price = item.price
      if (!price.unit_amount) continue
      const amount = price.unit_amount * (item.quantity ?? 1)
      // Normalise en mensuel
      if (price.recurring?.interval === 'month') {
        mrrCents += amount
      } else if (price.recurring?.interval === 'year') {
        mrrCents += Math.round(amount / 12)
      }
    }
  }

  const revenueThisMonth = recentCharges.data
    .filter(c => c.paid && !c.refunded)
    .reduce((sum, c) => sum + c.amount, 0)

  const newSubsThisMonth = subsResult.data.filter(
    s => s.created >= startOfMonth
  ).length

  const newSubsLastMonth = subsResult.data.filter(
    s => s.created >= startOfLastMonth && s.created <= endOfLastMonth
  ).length

  const activeCount = mrrResult.data.length
  const canceledThisMonth = subsResult.data.filter(
    s => s.status === 'canceled' && (s.canceled_at ?? 0) >= startOfMonth
  ).length

  res.json({
    mrr: {
      cents: mrrCents,
      euros: (mrrCents / 100).toFixed(2),
    },
    revenue: {
      thisMonthCents: revenueThisMonth,
      thisMonthEuros: (revenueThisMonth / 100).toFixed(2),
    },
    subscriptions: {
      active: activeCount,
      newThisMonth: newSubsThisMonth,
      newLastMonth: newSubsLastMonth,
      canceledThisMonth,
    },
    recentCharges: recentCharges.data.slice(0, 10).map(c => ({
      id: c.id,
      amountEuros: (c.amount / 100).toFixed(2),
      currency: c.currency,
      paid: c.paid,
      refunded: c.refunded,
      description: c.description ?? c.billing_details?.name ?? '—',
      createdAt: new Date(c.created * 1000).toISOString(),
    })),
  })
}
