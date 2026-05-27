create extension if not exists pgcrypto;

create type public.user_role as enum ('agent', 'agence', 'admin');
create type public.access_status as enum ('pending', 'approved', 'rejected', 'suspended');
create type public.subscription_status as enum ('trialing', 'active', 'past_due', 'paused', 'canceled');
create type public.privacy_request_status as enum ('received', 'processing', 'completed', 'rejected');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  siren text not null unique check (siren ~ '^[0-9]{9}$'),
  legal_name text not null,
  activity_code text,
  address text,
  administrative_status text,
  verification_source text not null default 'api-recherche-entreprises',
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.plans (
  code text primary key,
  label text not null,
  monthly_price_eur integer check (monthly_price_eur is null or monthly_price_eur >= 0),
  included_users integer,
  included_searches integer,
  custom_pricing boolean not null default false,
  created_at timestamptz not null default now()
);

insert into public.plans (code, label, monthly_price_eur, included_users, included_searches, custom_pricing)
values
  ('solo', 'Solo', 199, 1, 1500, false),
  ('agence', 'Agence', 499, 3, 5000, false),
  ('pro', 'Pro', 899, 7, 12000, false),
  ('reseau', 'Reseau', null, null, null, true);

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete set null,
  first_name text not null,
  last_name text not null,
  professional_email text not null,
  role public.user_role not null default 'agent',
  access_status public.access_status not null default 'pending',
  monthly_search_quota integer not null default 1500 check (monthly_search_quota >= 0),
  last_login_at timestamptz,
  approved_at timestamptz,
  approved_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index profiles_professional_email_lower_idx
  on public.profiles (lower(professional_email));
create index profiles_organization_id_idx on public.profiles (organization_id);
create index profiles_role_status_idx on public.profiles (role, access_status);

alter table public.organizations
  add constraint organizations_verified_by_fkey
  foreign key (verified_by) references public.profiles (id) on delete set null;

create table public.access_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  requested_role public.user_role not null check (requested_role <> 'admin'),
  professional_email text not null,
  siren text not null check (siren ~ '^[0-9]{9}$'),
  company_snapshot jsonb not null default '{}'::jsonb,
  status public.access_status not null default 'pending',
  review_notes text,
  reviewed_by uuid references public.profiles (id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index access_requests_one_pending_per_user_idx
  on public.access_requests (user_id)
  where status = 'pending';
create index access_requests_status_created_idx on public.access_requests (status, created_at desc);
create index access_requests_organization_id_idx on public.access_requests (organization_id);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_code text not null references public.plans (code),
  status public.subscription_status not null default 'trialing',
  seats integer not null default 1 check (seats > 0),
  monthly_search_quota integer check (monthly_search_quota is null or monthly_search_quota >= 0),
  billing_provider text,
  provider_customer_id text,
  provider_subscription_id text unique,
  starts_at timestamptz not null default now(),
  renews_at timestamptz,
  canceled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index subscriptions_organization_status_idx on public.subscriptions (organization_id, status);

create table public.monthly_usage (
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  period_start date not null,
  searches_used integer not null default 0 check (searches_used >= 0),
  updated_at timestamptz not null default now(),
  primary key (user_id, period_start)
);

create index monthly_usage_organization_period_idx
  on public.monthly_usage (organization_id, period_start);

create table public.searches (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  query_label text not null,
  filters jsonb not null default '{}'::jsonb,
  result_count integer not null default 0 check (result_count >= 0),
  units_consumed integer not null default 1 check (units_consumed > 0),
  created_at timestamptz not null default now()
);

create index searches_user_created_idx on public.searches (user_id, created_at desc);
create index searches_organization_created_idx on public.searches (organization_id, created_at desc);

create table public.favorites (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  target_siren text check (target_siren is null or target_siren ~ '^[0-9]{9}$'),
  target_name text not null,
  target_city text,
  note text,
  created_at timestamptz not null default now(),
  unique (user_id, target_siren, target_name)
);

create index favorites_user_created_idx on public.favorites (user_id, created_at desc);

create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete set null,
  actor_id uuid references public.profiles (id) on delete set null,
  action text not null,
  entity_type text not null,
  entity_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index audit_logs_organization_created_idx on public.audit_logs (organization_id, created_at desc);
create index audit_logs_actor_created_idx on public.audit_logs (actor_id, created_at desc);
create index audit_logs_action_created_idx on public.audit_logs (action, created_at desc);

create table public.privacy_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles (id) on delete set null,
  professional_email text not null,
  request_type text not null check (request_type in ('opposition', 'deletion', 'access', 'correction')),
  details text,
  status public.privacy_request_status not null default 'received',
  handled_by uuid references public.profiles (id) on delete set null,
  handled_at timestamptz,
  created_at timestamptz not null default now()
);

create index privacy_requests_status_created_idx on public.privacy_requests (status, created_at desc);

create table public.agency_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  invited_email text not null,
  invited_role public.user_role not null default 'agent' check (invited_role = 'agent'),
  invited_by uuid not null references public.profiles (id) on delete cascade,
  accepted_by uuid references public.profiles (id) on delete set null,
  accepted_at timestamptz,
  expires_at timestamptz not null default (now() + interval '14 days'),
  created_at timestamptz not null default now()
);

create index agency_invitations_organization_created_idx
  on public.agency_invitations (organization_id, created_at desc);

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;
grant usage on schema private to authenticated;

create or replace function private.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'admin'
      and access_status = 'approved'
  );
$$;

create or replace function private.is_approved()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and access_status = 'approved'
  );
$$;

create or replace function private.is_agency_manager()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and role = 'agence'
      and access_status = 'approved'
  );
$$;

create or replace function private.current_organization_id()
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select organization_id
  from public.profiles
  where id = (select auth.uid())
    and access_status = 'approved';
$$;

revoke all on all functions in schema private from public, anon, authenticated;
grant execute on function private.is_admin() to authenticated;
grant execute on function private.is_approved() to authenticated;
grant execute on function private.is_agency_manager() to authenticated;
grant execute on function private.current_organization_id() to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger organizations_set_updated_at before update on public.organizations
for each row execute function private.set_updated_at();
create trigger profiles_set_updated_at before update on public.profiles
for each row execute function private.set_updated_at();
create trigger access_requests_set_updated_at before update on public.access_requests
for each row execute function private.set_updated_at();
create trigger subscriptions_set_updated_at before update on public.subscriptions
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_company_name text := nullif(trim(new.raw_user_meta_data ->> 'company_name'), '');
  v_siren text := regexp_replace(coalesce(new.raw_user_meta_data ->> 'siren', ''), '[^0-9]', '', 'g');
  v_role public.user_role;
  v_org_id uuid;
  v_quota integer;
begin
  if v_siren !~ '^[0-9]{9}$' or v_company_name is null then
    raise exception 'SIREN et societe verifies requis pour creer un compte';
  end if;

  v_role := case
    when new.raw_user_meta_data ->> 'requested_role' = 'agence' then 'agence'::public.user_role
    else 'agent'::public.user_role
  end;
  v_quota := case when v_role = 'agence' then 5000 else 1500 end;

  insert into public.organizations (
    siren,
    legal_name,
    activity_code,
    address,
    administrative_status
  )
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
        end,
        activity_code = coalesce(public.organizations.activity_code, excluded.activity_code),
        address = coalesce(public.organizations.address, excluded.address),
        administrative_status = coalesce(public.organizations.administrative_status, excluded.administrative_status)
  returning id into v_org_id;

  insert into public.profiles (
    id,
    organization_id,
    first_name,
    last_name,
    professional_email,
    role,
    monthly_search_quota
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
    user_id,
    organization_id,
    requested_role,
    professional_email,
    siren,
    company_snapshot
  )
  values (
    new.id,
    v_org_id,
    v_role,
    lower(new.email),
    v_siren,
    jsonb_build_object(
      'name', v_company_name,
      'activity_code', new.raw_user_meta_data ->> 'activity_code',
      'address', new.raw_user_meta_data ->> 'address',
      'verification_source', 'api-recherche-entreprises'
    )
  );

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (v_org_id, new.id, 'access_request_created', 'profile', new.id);

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function private.handle_new_auth_user();

create or replace function public.review_access_request(
  p_user_id uuid,
  p_decision public.access_status,
  p_notes text default null
)
returns public.profiles
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin_id uuid := auth.uid();
  v_profile public.profiles;
begin
  if not private.is_admin() then
    raise exception 'Acces administrateur requis';
  end if;
  if p_decision not in ('approved'::public.access_status, 'rejected'::public.access_status) then
    raise exception 'Decision invalide';
  end if;

  update public.access_requests
    set status = p_decision,
        review_notes = p_notes,
        reviewed_by = v_admin_id,
        reviewed_at = now()
  where user_id = p_user_id and status = 'pending'
  returning user_id into p_user_id;

  if not found then
    raise exception 'Demande en attente introuvable';
  end if;

  update public.profiles
    set access_status = p_decision,
        approved_by = case when p_decision = 'approved' then v_admin_id else null end,
        approved_at = case when p_decision = 'approved' then now() else null end
  where id = p_user_id
  returning * into v_profile;

  if p_decision = 'approved' then
    update public.organizations
      set verified_at = coalesce(verified_at, now()),
          verified_by = coalesce(verified_by, v_admin_id)
    where id = v_profile.organization_id;
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id, metadata)
  values (
    v_profile.organization_id,
    v_admin_id,
    case when p_decision = 'approved' then 'access_approved' else 'access_rejected' end,
    'profile',
    p_user_id,
    jsonb_build_object('notes', p_notes)
  );

  return v_profile;
end;
$$;

revoke all on function public.review_access_request(uuid, public.access_status, text) from public, anon;
grant execute on function public.review_access_request(uuid, public.access_status, text) to authenticated;

create or replace function public.record_search(
  p_query_label text,
  p_filters jsonb default '{}'::jsonb,
  p_result_count integer default 0
)
returns public.searches
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_profile public.profiles;
  v_search public.searches;
  v_period date := date_trunc('month', current_date)::date;
  v_usage integer;
begin
  if not private.is_approved() then
    raise exception 'Compte valide requis';
  end if;

  select * into v_profile from public.profiles where id = v_user_id;

  insert into public.monthly_usage (user_id, organization_id, period_start, searches_used)
  values (v_user_id, v_profile.organization_id, v_period, 1)
  on conflict (user_id, period_start) do update
    set searches_used = public.monthly_usage.searches_used + 1,
        updated_at = now()
    where public.monthly_usage.searches_used < v_profile.monthly_search_quota
  returning searches_used into v_usage;

  if v_usage is null or v_usage > v_profile.monthly_search_quota then
    raise exception 'Quota mensuel atteint';
  end if;

  insert into public.searches (
    user_id,
    organization_id,
    query_label,
    filters,
    result_count
  )
  values (
    v_user_id,
    v_profile.organization_id,
    p_query_label,
    coalesce(p_filters, '{}'::jsonb),
    greatest(coalesce(p_result_count, 0), 0)
  )
  returning * into v_search;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (v_profile.organization_id, v_user_id, 'search_performed', 'search', v_search.id);

  return v_search;
end;
$$;

revoke all on function public.record_search(text, jsonb, integer) from public, anon;
grant execute on function public.record_search(text, jsonb, integer) to authenticated;

create or replace function public.record_login()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_profile public.profiles;
begin
  if not private.is_approved() then
    raise exception 'Compte valide requis';
  end if;

  update public.profiles
    set last_login_at = now()
  where id = auth.uid()
  returning * into v_profile;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (v_profile.organization_id, v_profile.id, 'login', 'profile', v_profile.id);
end;
$$;

revoke all on function public.record_login() from public, anon;
grant execute on function public.record_login() to authenticated;

create or replace function private.log_favorite_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.favorites;
begin
  if tg_op = 'DELETE' then
    v_row := old;
  else
    v_row := new;
  end if;

  insert into public.audit_logs (organization_id, actor_id, action, entity_type, entity_id)
  values (
    v_row.organization_id,
    auth.uid(),
    case when tg_op = 'DELETE' then 'favorite_removed' else 'favorite_saved' end,
    'favorite',
    v_row.id
  );
  return v_row;
end;
$$;

revoke all on function private.log_favorite_change() from public, anon, authenticated;

create trigger favorites_audit_insert after insert on public.favorites
for each row execute function private.log_favorite_change();
create trigger favorites_audit_delete after delete on public.favorites
for each row execute function private.log_favorite_change();

create or replace function public.admin_dashboard_totals()
returns table (entity text, total bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_admin() then
    raise exception 'Acces administrateur requis';
  end if;

  return query
    select 'demandes'::text, count(*) from public.access_requests
    union all select 'utilisateurs'::text, count(*) from public.profiles
    union all select 'abonnements'::text, count(*) from public.subscriptions
    union all select 'recherches'::text, count(*) from public.searches
    union all select 'favoris'::text, count(*) from public.favorites
    union all select 'logs'::text, count(*) from public.audit_logs;
end;
$$;

revoke all on function public.admin_dashboard_totals() from public, anon;
grant execute on function public.admin_dashboard_totals() to authenticated;

alter table public.organizations enable row level security;
alter table public.plans enable row level security;
alter table public.profiles enable row level security;
alter table public.access_requests enable row level security;
alter table public.subscriptions enable row level security;
alter table public.monthly_usage enable row level security;
alter table public.searches enable row level security;
alter table public.favorites enable row level security;
alter table public.audit_logs enable row level security;
alter table public.privacy_requests enable row level security;
alter table public.agency_invitations enable row level security;

create policy plans_are_public on public.plans
for select to anon, authenticated using (true);

create policy organization_members_or_admin_read on public.organizations
for select to authenticated
using (
  (select private.is_admin())
  or ((select private.is_approved()) and id = (select private.current_organization_id()))
);

create policy profiles_allowed_read on public.profiles
for select to authenticated
using (
  id = (select auth.uid())
  or (select private.is_admin())
  or (
    (select private.is_agency_manager())
    and organization_id = (select private.current_organization_id())
  )
);

create policy access_requests_owner_or_admin_read on public.access_requests
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy subscriptions_agency_or_admin_read on public.subscriptions
for select to authenticated
using (
  (select private.is_admin())
  or (
    (select private.is_agency_manager())
    and organization_id = (select private.current_organization_id())
  )
);

create policy usage_visible_to_owner_agency_admin on public.monthly_usage
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
  or (
    (select private.is_agency_manager())
    and organization_id = (select private.current_organization_id())
  )
);

create policy searches_visible_to_owner_agency_admin on public.searches
for select to authenticated
using (
  user_id = (select auth.uid())
  or (select private.is_admin())
  or (
    (select private.is_agency_manager())
    and organization_id = (select private.current_organization_id())
  )
);

create policy favorites_owner_or_admin_read on public.favorites
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));
create policy favorites_owner_insert on public.favorites
for insert to authenticated
with check (
  (select private.is_approved())
  and user_id = (select auth.uid())
  and organization_id = (select private.current_organization_id())
);
create policy favorites_owner_update on public.favorites
for update to authenticated
using (user_id = (select auth.uid()) and (select private.is_approved()))
with check (
  user_id = (select auth.uid())
  and organization_id = (select private.current_organization_id())
);
create policy favorites_owner_delete on public.favorites
for delete to authenticated
using (user_id = (select auth.uid()) and (select private.is_approved()));

create policy audit_visible_to_owner_agency_admin on public.audit_logs
for select to authenticated
using (
  actor_id = (select auth.uid())
  or (select private.is_admin())
  or (
    (select private.is_agency_manager())
    and organization_id = (select private.current_organization_id())
  )
);

create policy privacy_request_owner_insert on public.privacy_requests
for insert to authenticated
with check (user_id = (select auth.uid()));
create policy privacy_request_owner_or_admin_read on public.privacy_requests
for select to authenticated
using (user_id = (select auth.uid()) or (select private.is_admin()));

create policy invitations_agency_or_admin_read on public.agency_invitations
for select to authenticated
using (
  (select private.is_admin())
  or (
    (select private.is_agency_manager())
    and organization_id = (select private.current_organization_id())
  )
);
create policy invitations_agency_or_admin_insert on public.agency_invitations
for insert to authenticated
with check (
  invited_by = (select auth.uid())
  and (
    (select private.is_admin())
    or (
      (select private.is_agency_manager())
      and organization_id = (select private.current_organization_id())
    )
  )
);

grant select on public.plans to anon, authenticated;
grant select on public.organizations, public.profiles, public.access_requests, public.subscriptions,
  public.monthly_usage, public.searches, public.favorites, public.audit_logs,
  public.privacy_requests, public.agency_invitations to authenticated;
grant insert, update, delete on public.favorites to authenticated;
grant insert on public.privacy_requests, public.agency_invitations to authenticated;
