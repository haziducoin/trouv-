-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 012 — Admin bypass crédits & abonnement dans unlock_contact_field
-- Les emails listés dans is_platform_admin() ont accès illimité sans SQL data.
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Fonction : est-ce un admin plateforme ? ─────────────────────────────────
create or replace function private.is_platform_admin()
returns boolean language sql security definer set search_path = '' as $$
  select coalesce(
    (select email from auth.users where id = auth.uid()) = any(array[
      'contact@trouve.fr',
      'yassine.irh@gmail.com'
    ]),
    false
  )
$$;

-- ─── Réécriture unlock_contact_field avec bypass admin ───────────────────────
create or replace function public.unlock_contact_field(p_contact_id bigint, p_field text)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_uid     uuid := auth.uid();
  v_org     uuid;
  v_value   text;
  v_bal     public.credit_balances%rowtype;
  v_has_sub boolean;
  v_admin   boolean;
begin
  if p_field not in ('phone', 'email') then raise exception 'invalid_field'; end if;
  if not private.is_approved() then raise exception 'not_approved'; end if;

  v_admin := private.is_platform_admin();

  select organization_id into v_org from public.profiles where id = v_uid;
  if v_org is null then raise exception 'no_profile'; end if;

  -- Déjà débloqué → renvoyer sans reconsommer.
  select value into v_value from public.contact_unlocks
    where organization_id = v_org and contact_id = p_contact_id and field_type = p_field;
  if found then return v_value; end if;

  -- Vérif abonnement — ignorée pour les admins plateforme.
  if not v_admin then
    select exists (
      select 1 from public.subscriptions
      where organization_id = v_org and status in ('active', 'trialing')
    ) into v_has_sub;
    if not v_has_sub then raise exception 'no_subscription'; end if;
  end if;

  -- Valeur réelle depuis la table contacts.
  if p_field = 'phone' then
    select coalesce(nullif(telephone, ''), nullif(mobile, '')) into v_value
    from public.contacts where id = p_contact_id;
  else
    select nullif(email, '') into v_value
    from public.contacts where id = p_contact_id;
  end if;
  if v_value is null then raise exception 'no_data'; end if;

  -- Crédits — ignorés pour les admins plateforme.
  if not v_admin then
    select * into v_bal from public.credit_balances where organization_id = v_org for update;
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
  end if;

  insert into public.contact_unlocks (organization_id, contact_id, field_type, value, unlocked_by)
    values (v_org, p_contact_id, p_field, v_value, v_uid)
    on conflict (organization_id, contact_id, field_type) do nothing;

  return v_value;
end; $$;

revoke all on function public.unlock_contact_field(bigint, text) from public, anon;
grant execute on function public.unlock_contact_field(bigint, text) to authenticated;
