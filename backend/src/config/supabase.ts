import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL            ?? '',
  process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// ─── Types alignés sur le schéma Supabase ────────────────────────────────────

export type SubscriptionStatus = 'trialing' | 'active' | 'past_due' | 'paused' | 'canceled'
export type PlanCode = 'solo' | 'agence' | 'pro' | 'reseau'

export interface OrgSubscription {
  id:                     string
  organization_id:        string
  plan_code:              PlanCode
  status:                 SubscriptionStatus
  seats:                  number
  monthly_search_quota:   number | null
  billing_provider:       string | null
  provider_customer_id:   string | null
  provider_subscription_id: string | null
  starts_at:              string
  renews_at:              string | null
  canceled_at:            string | null
}

// Quotas de recherches par plan (copie de la DB pour usage dans l'API)
export const PLAN_QUOTAS: Record<PlanCode, number> = {
  solo:   1500,
  agence: 5000,
  pro:    12000,
  reseau: 999999,
}
