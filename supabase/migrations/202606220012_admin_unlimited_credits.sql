-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 012 — Crédits illimités pour le compte admin (yassine.irh@gmail.com)
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_user_id      uuid;
  v_org_id       uuid;
begin
  -- Récupérer l'ID utilisateur
  select id into v_user_id
  from auth.users
  where email = 'yassine.irh@gmail.com'
  limit 1;

  if v_user_id is null then
    raise notice 'Utilisateur yassine.irh@gmail.com introuvable — migration ignorée';
    return;
  end if;

  -- Récupérer l'organisation
  select organization_id into v_org_id
  from public.profiles
  where id = v_user_id
  limit 1;

  if v_org_id is null then
    raise notice 'Aucune organisation trouvée pour cet utilisateur';
    return;
  end if;

  -- Insérer ou mettre à jour en mode illimité
  insert into public.credit_balances (organization_id, phone_credits, email_credits, unlimited, updated_at)
  values (v_org_id, 999999, 999999, true, now())
  on conflict (organization_id) do update
    set phone_credits = 999999,
        email_credits = 999999,
        unlimited     = true,
        updated_at    = now();

  raise notice 'Crédits illimités activés pour organisation %', v_org_id;
end $$;
