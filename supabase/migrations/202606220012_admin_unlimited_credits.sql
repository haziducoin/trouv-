-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 012 — Crédits illimités pour les comptes admin
-- ═══════════════════════════════════════════════════════════════════════════

do $$
declare
  v_email   text;
  v_user_id uuid;
  v_org_id  uuid;
begin
  foreach v_email in array array['contact@trouve.fr', 'yassine.irh@gmail.com']
  loop
    select id into v_user_id from auth.users where email = v_email limit 1;

    if v_user_id is null then
      raise notice 'Utilisateur % introuvable — ignoré', v_email;
      continue;
    end if;

    select organization_id into v_org_id from public.profiles where id = v_user_id limit 1;

    if v_org_id is null then
      raise notice 'Aucune organisation pour %', v_email;
      continue;
    end if;

    insert into public.credit_balances (organization_id, phone_credits, email_credits, unlimited, updated_at)
    values (v_org_id, 999999, 999999, true, now())
    on conflict (organization_id) do update
      set phone_credits = 999999,
          email_credits = 999999,
          unlimited     = true,
          updated_at    = now();

    raise notice 'Crédits illimités activés pour % (org: %)', v_email, v_org_id;
  end loop;
end $$;
