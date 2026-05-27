-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 002 — Stripe : périodes de facturation + plans étendus
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Ajouter la période de facturation aux abonnements ───────────────────
alter table public.subscriptions
  add column if not exists billing_period text
    check (billing_period in ('monthly', 'quarterly', 'annual'))
    default 'monthly',
  add column if not exists trial_ends_at timestamptz,
  add column if not exists updated_at timestamptz default now();

-- ─── 2. Mettre à jour les plans avec les nouveaux prix ──────────────────────
-- Mensuel (prix de base inchangés)
-- On ajoute les prix trimestriels et annuels dans la table plans

alter table public.plans
  add column if not exists quarterly_price_eur integer,
  add column if not exists annual_price_eur     integer,
  add column if not exists stripe_product_id    text,
  add column if not exists stripe_price_monthly  text,
  add column if not exists stripe_price_quarterly text,
  add column if not exists stripe_price_annual   text,
  add column if not exists trial_days            integer default 14;

-- Mise à jour des prix trimestriels et annuels
-- Trimestriel : -15 % (facturé tous les 3 mois)
-- Annuel      : -20 % (facturé à l'année)
update public.plans set
  quarterly_price_eur = 169,   -- 169 € × 3 = 507 € / trimestre
  annual_price_eur    = 159,   -- 159 € × 12 = 1 908 € / an
  trial_days          = 14
where code = 'solo';

update public.plans set
  quarterly_price_eur = 424,   -- 424 € × 3 = 1 272 € / trimestre
  annual_price_eur    = 399,   -- 399 € × 12 = 4 788 € / an
  trial_days          = 14
where code = 'agence';

update public.plans set
  quarterly_price_eur = 764,   -- 764 € × 3 = 2 292 € / trimestre
  annual_price_eur    = 719,   -- 719 € × 12 = 8 628 € / an
  trial_days          = 14
where code = 'pro';

-- ─── 3. Table des add-ons achetés ───────────────────────────────────────────
create table if not exists public.addon_purchases (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  addon_type       text not null check (addon_type in ('extra_searches_500', 'extra_user')),
  stripe_payment_id text,
  amount_eur       integer not null,
  applied_at       timestamptz,
  expires_at       timestamptz,  -- null = permanent
  created_at       timestamptz not null default now()
);

create index if not exists addon_purchases_org_idx on public.addon_purchases (organization_id, created_at desc);

alter table public.addon_purchases enable row level security;

create policy addon_purchases_agency_or_admin on public.addon_purchases
  for select to authenticated
  using (
    (select private.is_admin())
    or (
      (select private.is_agency_manager())
      and organization_id = (select private.current_organization_id())
    )
  );

grant select on public.addon_purchases to authenticated;

-- ─── 4. Vue : état de facturation d'une organisation ────────────────────────
create or replace view public.billing_summary as
select
  o.id                          as organization_id,
  o.legal_name,
  o.siren,
  s.plan_code,
  s.status                      as subscription_status,
  s.billing_period,
  s.trial_ends_at,
  s.renews_at,
  s.canceled_at,
  s.provider_customer_id        as stripe_customer_id,
  s.provider_subscription_id    as stripe_subscription_id,
  p.monthly_price_eur,
  p.quarterly_price_eur,
  p.annual_price_eur,
  p.included_searches,
  p.included_users,
  p.trial_days
from public.organizations o
left join public.subscriptions s
  on s.organization_id = o.id
  and s.status in ('trialing', 'active', 'past_due')
left join public.plans p
  on p.code = s.plan_code;

-- ─── 5. Trigger updated_at sur subscriptions ────────────────────────────────
drop trigger if exists subscriptions_set_updated_at on public.subscriptions;
create trigger subscriptions_set_updated_at
  before update on public.subscriptions
  for each row execute function private.set_updated_at();
