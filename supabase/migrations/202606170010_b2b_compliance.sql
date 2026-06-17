-- ═══════════════════════════════════════════════════════════════════════════
-- Migration 010 — Conformité B2B : audit complet, CGU, champs profil
-- audit_logs existait déjà avec actor_id — on étend sans renommer
-- ═══════════════════════════════════════════════════════════════════════════

-- ─── Ajouter 'trial' à l'enum access_status si manquant ─────────────────────
DO $$ BEGIN
  ALTER TYPE public.access_status ADD VALUE 'trial';
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- ─── Nouveaux champs profil ──────────────────────────────────────────────────
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS function_title  text,
  ADD COLUMN IF NOT EXISTS website         text,
  ADD COLUMN IF NOT EXISTS registration_ip text,
  ADD COLUMN IF NOT EXISTS cgu_accepted    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cgu_accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS cgu_ip          text,
  ADD COLUMN IF NOT EXISTS cgu_version     text;

-- ─── Étendre audit_logs existant ────────────────────────────────────────────
-- La table existe avec: id, organization_id, actor_id, action,
-- entity_type, entity_id, metadata, created_at
-- On ajoute les colonnes B2B manquantes.
ALTER TABLE public.audit_logs
  ADD COLUMN IF NOT EXISTS contact_id bigint,
  ADD COLUMN IF NOT EXISTS field_type text CHECK (field_type IN ('phone', 'email')),
  ADD COLUMN IF NOT EXISTS ip_address text,
  ADD COLUMN IF NOT EXISTS user_agent text;

CREATE INDEX IF NOT EXISTS audit_logs_actor_id_idx   ON public.audit_logs (actor_id);
CREATE INDEX IF NOT EXISTS audit_logs_org_id_idx     ON public.audit_logs (organization_id);
CREATE INDEX IF NOT EXISTS audit_logs_action_idx     ON public.audit_logs (action);
CREATE INDEX IF NOT EXISTS audit_logs_created_at_idx ON public.audit_logs (created_at DESC);
CREATE INDEX IF NOT EXISTS audit_logs_contact_id_idx ON public.audit_logs (contact_id) WHERE contact_id IS NOT NULL;

-- ─── RLS audit_logs ─────────────────────────────────────────────────────────
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS audit_logs_admin_read ON public.audit_logs;
CREATE POLICY audit_logs_admin_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (private.is_admin());

DROP POLICY IF EXISTS audit_logs_own_read ON public.audit_logs;
CREATE POLICY audit_logs_own_read ON public.audit_logs
  FOR SELECT TO authenticated
  USING (actor_id = auth.uid());

GRANT SELECT ON public.audit_logs TO authenticated;

-- ─── RPC : journalisation générique ─────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.log_audit_event(
  p_action      text,
  p_contact_id  bigint  DEFAULT NULL,
  p_field_type  text    DEFAULT NULL,
  p_ip          text    DEFAULT NULL,
  p_metadata    jsonb   DEFAULT '{}'::jsonb
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_org uuid;
BEGIN
  SELECT organization_id INTO v_org
  FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.audit_logs (actor_id, organization_id, action, contact_id, field_type, ip_address, metadata)
  VALUES (v_uid, v_org, p_action, p_contact_id, p_field_type, p_ip, p_metadata);
END; $$;

GRANT EXECUTE ON FUNCTION public.log_audit_event(text, bigint, text, text, jsonb) TO authenticated;

-- ─── RPC : acceptation CGU ───────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.accept_cgu(
  p_version text DEFAULT '1.0',
  p_ip      text DEFAULT NULL
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  UPDATE public.profiles
  SET cgu_accepted    = true,
      cgu_accepted_at = now(),
      cgu_ip          = p_ip,
      cgu_version     = p_version,
      updated_at      = now()
  WHERE id = v_uid;

  SELECT organization_id INTO v_org FROM public.profiles WHERE id = v_uid;

  INSERT INTO public.audit_logs (actor_id, organization_id, action, ip_address, metadata)
  VALUES (v_uid, v_org, 'cgu_accepted', p_ip, jsonb_build_object('version', p_version));
END; $$;

GRANT EXECUTE ON FUNCTION public.accept_cgu(text, text) TO authenticated;

-- ─── RPC : enregistrement de connexion ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_login()
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  UPDATE public.profiles SET last_login_at = now(), updated_at = now() WHERE id = v_uid;
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.audit_logs (actor_id, organization_id, action)
  VALUES (v_uid, v_org, 'login');
END; $$;

GRANT EXECUTE ON FUNCTION public.record_login() TO authenticated;

-- ─── RPC : enregistrement de recherche ──────────────────────────────────────
CREATE OR REPLACE FUNCTION public.record_search(
  p_query_label  text,
  p_filters      jsonb,
  p_result_count integer
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE
  v_uid uuid := auth.uid(); v_org uuid;
BEGIN
  SELECT organization_id INTO v_org FROM public.profiles WHERE id = v_uid;
  INSERT INTO public.audit_logs (actor_id, organization_id, action, metadata)
  VALUES (v_uid, v_org, 'search',
    jsonb_build_object('query', p_query_label, 'filters', p_filters, 'results', p_result_count));
END; $$;

GRANT EXECUTE ON FUNCTION public.record_search(text, jsonb, integer) TO authenticated;

-- ─── Trigger : log des déblocages contact ────────────────────────────────────
CREATE OR REPLACE FUNCTION private.log_contact_unlock()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  INSERT INTO public.audit_logs (actor_id, organization_id, action, contact_id, field_type)
  VALUES (NEW.unlocked_by, NEW.organization_id, 'unlock', NEW.contact_id, NEW.field_type);
  RETURN NEW;
END; $$;

DROP TRIGGER IF EXISTS contact_unlock_audit ON public.contact_unlocks;
CREATE TRIGGER contact_unlock_audit
  AFTER INSERT ON public.contact_unlocks
  FOR EACH ROW EXECUTE FUNCTION private.log_contact_unlock();

-- ─── Vue admin : journal enrichi ─────────────────────────────────────────────
CREATE OR REPLACE VIEW public.audit_log_view AS
SELECT
  al.id,
  al.created_at,
  al.action,
  al.contact_id,
  al.field_type,
  al.ip_address,
  al.metadata,
  p.professional_email  AS user_email,
  p.first_name || ' ' || p.last_name AS user_name,
  o.legal_name          AS company_name,
  o.siren
FROM public.audit_logs al
LEFT JOIN public.profiles     p ON p.id  = al.actor_id
LEFT JOIN public.organizations o ON o.id = al.organization_id
ORDER BY al.created_at DESC;

REVOKE ALL ON public.audit_log_view FROM anon, authenticated;
GRANT SELECT ON public.audit_log_view TO authenticated;
