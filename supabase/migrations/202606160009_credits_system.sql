-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 009 — Système de crédits (téléphone / email) + déblocage sécurisé
-- ═══════════════════════════════════════════════════════════════════════════
-- Modèle :
--   • Crédits au niveau ORGANISATION (partagés équipe), séparés tél / email.
--   • Une recherche ne consomme RIEN. Un crédit est consommé uniquement à l'unlock.
--   • Un champ déjà débloqué reste visible sans reconsommer (idempotent).
--   • Données masquées côté serveur ; la vraie valeur ne sort qu'à l'unlock.
--   • Démo / sans abonnement actif → pas d'unlock (redirection pricing côté app).
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Tables ─────────────────────────────────────────────────────────────────
create table if not exists public.credit_balances (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  phone_credits   integer not null default 0 check (phone_credits >= 0),
  email_credits   integer not null default 0 check (email_credits >= 0),
  unlimited       boolean not null default false,
  updated_at      timestamptz not null default now()
);

create table if not exists public.contact_unlocks (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid   not null references public.organizations(id) on delete cascade,
  contact_id      bigint not null,
  field_type      text   not null check (field_type in ('phone', 'email')),
  value           text,
  unlocked_by     uuid references public.profiles(id) on delete set null,
  unlocked_at     timestamptz not null default now(),
  unique (organization_id, contact_id, field_type)
);
create index if not exists contact_unlocks_org_contact_idx
  on public.contact_unlocks (organization_id, contact_id);

-- ─── RLS : lecture pour les membres de l'orga ; écriture via RPC uniquement ──
alter table public.credit_balances enable row level security;
alter table public.contact_unlocks enable row level security;

drop policy if exists credit_balances_org_read on public.credit_balances;
create policy credit_balances_org_read on public.credit_balances
  for select to authenticated
  using ((select private.is_admin()) or organization_id = (select private.current_organization_id()));

drop policy if exists contact_unlocks_org_read on public.contact_unlocks;
create policy contact_unlocks_org_read on public.contact_unlocks
  for select to authenticated
  using ((select private.is_admin()) or organization_id = (select private.current_organization_id()));

grant select on public.credit_balances to authenticated;
grant select on public.contact_unlocks to authenticated;

-- ─── Helpers de masquage (privés) ───────────────────────────────────────────
create or replace function private.mask_phone(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare d text := regexp_replace(coalesce(p, ''), '[^0-9]', '', 'g');
begin
  if d = '' then return null; end if;
  if length(d) = 9 then d := '0' || d; end if;
  if length(d) < 4 then return d; end if;
  return substr(d, 1, 2) || ' ' || substr(d, 3, 2) || ' XX XX XX';
end; $$;

create or replace function private.mask_email(p text)
returns text language plpgsql immutable set search_path = '' as $$
declare lp text; dom text;
begin
  if coalesce(p, '') = '' or position('@' in p) = 0 then return null; end if;
  lp := split_part(p, '@', 1);
  dom := split_part(p, '@', 2);
  if length(lp) <= 2 then return left(lp, 1) || '***@' || dom; end if;
  return left(lp, 3) || '***@' || dom;
end; $$;

-- ─── Octroi des crédits selon l'offre (appelé par le webhook Stripe) ─────────
create or replace function public.grant_plan_credits(p_org_id uuid, p_plan_code text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_phone int := 0; v_email int := 0; v_unlimited boolean := false;
begin
  if p_plan_code = 'solo' then
    v_phone := 100; v_email := 25;
  elsif p_plan_code = 'agence' then
    v_phone := 250; v_email := 250;
  elsif p_plan_code = 'entreprise' then
    v_unlimited := true;
  end if;

  insert into public.credit_balances (organization_id, phone_credits, email_credits, unlimited, updated_at)
  values (p_org_id, v_phone, v_email, v_unlimited, now())
  on conflict (organization_id) do update
    set phone_credits = excluded.phone_credits,
        email_credits = excluded.email_credits,
        unlimited     = excluded.unlimited,
        updated_at    = now();
end; $$;
revoke all on function public.grant_plan_credits(uuid, text) from public, anon, authenticated;

-- ─── Déblocage d'un champ (consomme 1 crédit, idempotent) ───────────────────
-- Renvoie la valeur réelle. Lève une exception en cas de blocage (codes en message).
create or replace function public.unlock_contact_field(p_contact_id bigint, p_field text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid   uuid := auth.uid();
  v_org   uuid;
  v_value text;
  v_bal   public.credit_balances%rowtype;
  v_has_sub boolean;
begin
  if p_field not in ('phone', 'email') then raise exception 'invalid_field'; end if;
  if not private.is_approved() then raise exception 'not_approved'; end if;

  select organization_id into v_org from public.profiles where id = v_uid;
  if v_org is null then raise exception 'no_profile'; end if;

  -- Déjà débloqué → renvoyer sans reconsommer.
  select value into v_value from public.contact_unlocks
    where organization_id = v_org and contact_id = p_contact_id and field_type = p_field;
  if found then return v_value; end if;

  -- Abonnement actif requis (sinon l'app redirige vers le pricing).
  select exists (
    select 1 from public.subscriptions
    where organization_id = v_org and status in ('active', 'trialing')
  ) into v_has_sub;
  if not v_has_sub then raise exception 'no_subscription'; end if;

  -- Valeur réelle depuis la table contacts.
  if p_field = 'phone' then
    select coalesce(nullif(telephone, ''), nullif(mobile, '')) into v_value from public.contacts where id = p_contact_id;
  else
    select nullif(email, '') into v_value from public.contacts where id = p_contact_id;
  end if;
  if v_value is null then raise exception 'no_data'; end if;

  -- Crédits (verrou ligne).
  select * into v_bal from public.credit_balances where organization_id = v_org for update;
  if not found then raise exception 'no_credits'; end if;

  if not v_bal.unlimited then
    if p_field = 'phone' and v_bal.phone_credits <= 0 then raise exception 'no_phone_credits'; end if;
    if p_field = 'email' and v_bal.email_credits <= 0 then raise exception 'no_email_credits'; end if;
    update public.credit_balances
      set phone_credits = phone_credits - case when p_field = 'phone' then 1 else 0 end,
          email_credits = email_credits - case when p_field = 'email' then 1 else 0 end,
          updated_at = now()
      where organization_id = v_org;
  end if;

  insert into public.contact_unlocks (organization_id, contact_id, field_type, value, unlocked_by)
    values (v_org, p_contact_id, p_field, v_value, v_uid)
    on conflict (organization_id, contact_id, field_type) do nothing;

  return v_value;
end; $$;
revoke all on function public.unlock_contact_field(bigint, text) from public, anon;
grant execute on function public.unlock_contact_field(bigint, text) to authenticated;

-- ─── Recherche sécurisée : masque côté serveur + flags d'unlock ─────────────
-- Enveloppe search_contacts (inchangée) ; ne renvoie JAMAIS la valeur complète
-- d'un champ non débloqué. La vraie valeur n'apparaît que si déjà débloquée.
create or replace function public.search_contacts_secure(
  p_nom    text default null,
  p_prenom text default null,
  p_ville  text default null,
  p_cp     text default null,
  p_mode   text default 'exact',
  p_tel    text default null,
  p_limit  int  default 50,
  p_offset int  default 0
)
returns table (
  id bigint, nom text, prenom text,
  adresse text, code_postal text, ville text, source text,
  societe text,
  phone_masked text, phone_unlocked boolean, phone_value text, has_phone boolean,
  email_masked text, email_unlocked boolean, email_value text, has_email boolean,
  score real, total_count bigint
)
language plpgsql security definer stable set search_path = '' as $$
declare v_org uuid; v_status public.access_status;
begin
  -- Démo (pending) + trial + approved peuvent chercher (données masquées).
  -- Seuls rejected / suspended sont bloqués.
  select organization_id, access_status into v_org, v_status
    from public.profiles where id = auth.uid();
  if v_org is null or v_status in ('rejected', 'suspended') then
    raise exception 'not_allowed';
  end if;

  return query
  select
    s.id, s.nom, s.prenom,
    s.adresse, s.code_postal, s.ville, s.source,
    c.societe,
    private.mask_phone(coalesce(nullif(s.telephone, ''), nullif(s.mobile, ''))),
    (up.id is not null),
    case when up.id is not null then up.value else null end,
    (coalesce(nullif(s.telephone, ''), nullif(s.mobile, '')) is not null),
    private.mask_email(s.email),
    (ue.id is not null),
    case when ue.id is not null then ue.value else null end,
    (nullif(s.email, '') is not null),
    s.score, s.total_count
  from public.search_contacts(p_nom, p_prenom, p_ville, p_cp, p_mode, p_tel, p_limit, p_offset) s
  left join public.contacts c on c.id = s.id
  left join public.contact_unlocks up on up.organization_id = v_org and up.contact_id = s.id and up.field_type = 'phone'
  left join public.contact_unlocks ue on ue.organization_id = v_org and ue.contact_id = s.id and ue.field_type = 'email';
end; $$;
revoke all on function public.search_contacts_secure(text, text, text, text, text, text, int, int) from public, anon;
grant execute on function public.search_contacts_secure(text, text, text, text, text, text, int, int) to authenticated;
