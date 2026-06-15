-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 008 — SIREN optionnel
-- L'inscription a été simplifiée (plus de SIREN obligatoire). On aligne le schéma :
--   • organizations.siren et access_requests.siren deviennent nullable
--   • le trigger handle_new_auth_user ne lève plus d'exception sans SIREN
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── 1. organizations.siren nullable + check relâché ────────────────────────
alter table public.organizations alter column siren drop not null;
alter table public.organizations drop constraint if exists organizations_siren_check;
alter table public.organizations add constraint organizations_siren_check
  check (siren is null or siren ~ '^[0-9]{9}$');

-- ─── 2. access_requests.siren nullable + check relâché ──────────────────────
alter table public.access_requests alter column siren drop not null;
alter table public.access_requests drop constraint if exists access_requests_siren_check;
alter table public.access_requests add constraint access_requests_siren_check
  check (siren is null or siren ~ '^[0-9]{9}$');

-- ─── 3. Trigger SIREN-optionnel ─────────────────────────────────────────────
create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- À défaut de société, on dérive un nom lisible du domaine de l'email pro.
  v_company_name text := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'company_name'), ''),
    initcap(split_part(split_part(new.email, '@', 2), '.', 1))
  );
  v_siren text := nullif(regexp_replace(coalesce(new.raw_user_meta_data ->> 'siren', ''), '[^0-9]', '', 'g'), '');
  v_role public.user_role;
  v_org_id uuid;
  v_quota integer;
begin
  -- SIREN ignoré s'il n'est pas au bon format (pas d'exception).
  if v_siren is not null and v_siren !~ '^[0-9]{9}$' then
    v_siren := null;
  end if;

  v_role := case
    when new.raw_user_meta_data ->> 'requested_role' = 'agence' then 'agence'::public.user_role
    else 'agent'::public.user_role
  end;
  v_quota := case when v_role = 'agence' then 5000 else 1500 end;

  insert into public.organizations (siren, legal_name, activity_code, address, administrative_status)
  values (
    v_siren,
    v_company_name,
    nullif(new.raw_user_meta_data ->> 'activity_code', ''),
    nullif(new.raw_user_meta_data ->> 'address', ''),
    nullif(new.raw_user_meta_data ->> 'administrative_status', '')
  )
  on conflict (siren) do update
    set legal_name = case
          when public.organizations.verified_at is null then excluded.legal_name
          else public.organizations.legal_name
        end
  returning id into v_org_id;

  insert into public.profiles (
    id, organization_id, first_name, last_name, professional_email, role, monthly_search_quota
  )
  values (
    new.id,
    v_org_id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'first_name'), ''), 'Utilisateur'),
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'last_name'), ''), 'Professionnel'),
    lower(new.email),
    v_role,
    v_quota
  );

  insert into public.access_requests (
    user_id, organization_id, requested_role, professional_email, siren, company_snapshot
  )
  values (
    new.id,
    v_org_id,
    v_role,
    lower(new.email),
    v_siren,
    jsonb_build_object('name', v_company_name, 'verification_source', 'self-service')
  );

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (v_org_id, new.id, 'access_request_created', 'profile', new.id);

  return new;
end;
$$;
