-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 013 — Modèle crédits frontend
-- Supabase retourne toujours la vraie valeur aux users approuvés.
-- Le site gère l'affichage masqué/révélé selon les clés.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. Récupère la vraie valeur (pas de check abonnement ni crédit) ─────────
create or replace function public.get_contact_value(p_contact_id bigint, p_field text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_value text;
begin
  if p_field not in ('phone', 'email') then raise exception 'invalid_field'; end if;
  if not private.is_approved() then raise exception 'not_approved'; end if;

  if p_field = 'phone' then
    select coalesce(nullif(telephone, ''), nullif(mobile, '')) into v_value
    from public.contacts where id = p_contact_id;
  else
    select nullif(email, '') into v_value
    from public.contacts where id = p_contact_id;
  end if;

  return v_value;
end; $$;
revoke all on function public.get_contact_value(bigint, text) from public, anon;
grant execute on function public.get_contact_value(bigint, text) to authenticated;

-- ─── 2. Consomme 1 crédit + mémorise l'unlock (idempotent) ──────────────────
-- Appelé par le site APRÈS avoir obtenu la valeur via get_contact_value.
-- Gratuit si ce contact était déjà débloqué.
create or replace function public.use_credit(p_contact_id bigint, p_field text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_uid  uuid := auth.uid();
  v_org  uuid;
  v_bal  public.credit_balances%rowtype;
begin
  if p_field not in ('phone', 'email') then raise exception 'invalid_field'; end if;
  if not private.is_approved() then raise exception 'not_approved'; end if;

  select organization_id into v_org from public.profiles where id = v_uid;
  if v_org is null then raise exception 'no_profile'; end if;

  -- Déjà débloqué → gratuit, on mémorise juste
  if exists (
    select 1 from public.contact_unlocks
    where organization_id = v_org and contact_id = p_contact_id and field_type = p_field
  ) then
    return;
  end if;

  -- Vérifier et déduire 1 crédit
  select * into v_bal from public.credit_balances
    where organization_id = v_org for update;

  if not found then raise exception 'no_credits'; end if;

  if not v_bal.unlimited then
    if p_field = 'phone' and v_bal.phone_credits <= 0 then raise exception 'no_phone_credits'; end if;
    if p_field = 'email' and v_bal.email_credits <= 0 then raise exception 'no_email_credits'; end if;
    update public.credit_balances
      set phone_credits = phone_credits - case when p_field = 'phone' then 1 else 0 end,
          email_credits = email_credits - case when p_field = 'email' then 1 else 0 end,
          updated_at    = now()
      where organization_id = v_org;
  end if;

  -- Mémoriser l'unlock
  insert into public.contact_unlocks (organization_id, contact_id, field_type, unlocked_by)
  values (v_org, p_contact_id, p_field, v_uid)
  on conflict (organization_id, contact_id, field_type) do nothing;
end; $$;
revoke all on function public.use_credit(bigint, text) from public, anon;
grant execute on function public.use_credit(bigint, text) to authenticated;
