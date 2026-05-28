-- =======================================================================
-- trouvé! — Schéma complet de la base de données
-- Exécuter dans : Supabase Dashboard → SQL Editor → New query
-- Projet : gznulbslryeiurwiwkre
-- =======================================================================

-- ─── 1. Organizations (sociétés vérifiées par SIREN) ─────────────────
CREATE TABLE IF NOT EXISTS public.organizations (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  siren      TEXT UNIQUE NOT NULL,
  legal_name TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 2. Profiles (comptes utilisateurs, liés à auth.users) ───────────
CREATE TABLE IF NOT EXISTS public.profiles (
  id                   UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id      UUID REFERENCES public.organizations(id),
  first_name           TEXT NOT NULL DEFAULT '',
  last_name            TEXT NOT NULL DEFAULT '',
  professional_email   TEXT NOT NULL UNIQUE,
  role                 TEXT NOT NULL DEFAULT 'agent'
                         CHECK (role IN ('agent','agence','admin')),
  access_status        TEXT NOT NULL DEFAULT 'pending'
                         CHECK (access_status IN ('pending','approved','rejected','suspended')),
  monthly_search_quota INTEGER NOT NULL DEFAULT 1500,
  created_at           TIMESTAMPTZ DEFAULT NOW(),
  last_login_at        TIMESTAMPTZ
);

-- ─── 3. Monthly usage (compteur de recherches par mois) ──────────────
CREATE TABLE IF NOT EXISTS public.monthly_usage (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id    UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start  DATE NOT NULL,
  searches_used INTEGER NOT NULL DEFAULT 0,
  UNIQUE (profile_id, period_start)
);

-- ─── 4. Audit logs ────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.audit_logs (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  action     TEXT NOT NULL,
  actor_id   UUID REFERENCES public.profiles(id),
  target_id  UUID REFERENCES public.profiles(id),
  metadata   JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ─── 5. Favorites (contacts sauvegardés) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.favorites (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  organization_id UUID REFERENCES public.organizations(id),
  target_siren    TEXT,
  target_name     TEXT NOT NULL,
  target_city     TEXT,
  note            TEXT,
  created_at      TIMESTAMPTZ DEFAULT NOW()
);

-- =======================================================================
-- HELPER : is_admin() — évite la récursion infinie dans les RLS policies
-- =======================================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN LANGUAGE sql SECURITY DEFINER
SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$;

-- =======================================================================
-- TRIGGER : créer un profil "pending" à chaque nouvelle inscription OAuth
-- =======================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_email TEXT;
  v_first TEXT;
  v_last  TEXT;
BEGIN
  v_email := COALESCE(NEW.email, '');

  -- Prénom depuis les métadonnées OAuth (Google / Microsoft)
  v_first := COALESCE(
    NEW.raw_user_meta_data->>'given_name',
    split_part(COALESCE(NEW.raw_user_meta_data->>'name', ''), ' ', 1),
    split_part(v_email, '@', 1)
  );

  -- Nom de famille
  v_last := COALESCE(
    NEW.raw_user_meta_data->>'family_name',
    CASE
      WHEN (NEW.raw_user_meta_data->>'name') LIKE '% %'
      THEN substr(
        NEW.raw_user_meta_data->>'name',
        strpos(NEW.raw_user_meta_data->>'name', ' ') + 1
      )
      ELSE ''
    END,
    ''
  );

  INSERT INTO public.profiles (
    id, first_name, last_name, professional_email,
    role, access_status, monthly_search_quota
  )
  VALUES (
    NEW.id, v_first, v_last, v_email,
    'agent', 'pending', 1500
  )
  ON CONFLICT (id) DO NOTHING;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- =======================================================================
-- RPC : record_login — journalise la connexion et met à jour last_login_at
-- =======================================================================
CREATE OR REPLACE FUNCTION public.record_login()
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = NOW()
  WHERE id = auth.uid();

  INSERT INTO public.audit_logs (action, actor_id, target_id)
  VALUES ('login', auth.uid(), auth.uid());
END;
$$;

-- =======================================================================
-- RPC : record_search — incrémente le compteur mensuel + log
-- =======================================================================
CREATE OR REPLACE FUNCTION public.record_search(
  p_query_label  TEXT,
  p_filters      JSONB,
  p_result_count INTEGER
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_period DATE := date_trunc('month', NOW())::DATE;
BEGIN
  -- Upsert compteur mensuel
  INSERT INTO public.monthly_usage (profile_id, period_start, searches_used)
  VALUES (auth.uid(), v_period, 1)
  ON CONFLICT (profile_id, period_start)
  DO UPDATE SET searches_used = monthly_usage.searches_used + 1;

  -- Log de l'action
  INSERT INTO public.audit_logs (action, actor_id, metadata)
  VALUES (
    'search', auth.uid(),
    jsonb_build_object(
      'query',   p_query_label,
      'filters', p_filters,
      'results', p_result_count
    )
  );
END;
$$;

-- =======================================================================
-- RPC : review_access_request — admin approuve ou rejette un compte
-- =======================================================================
CREATE OR REPLACE FUNCTION public.review_access_request(
  p_user_id  UUID,
  p_decision TEXT,       -- 'approved' ou 'rejected'
  p_notes    TEXT DEFAULT NULL
)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  -- Seul un admin peut valider
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Accès refusé — rôle admin requis.';
  END IF;

  UPDATE public.profiles
  SET access_status = p_decision
  WHERE id = p_user_id;

  INSERT INTO public.audit_logs (action, actor_id, target_id, metadata)
  VALUES (
    'review_' || p_decision,
    auth.uid(),
    p_user_id,
    CASE WHEN p_notes IS NOT NULL
      THEN jsonb_build_object('notes', p_notes)
      ELSE NULL
    END
  );
END;
$$;

-- =======================================================================
-- RPC : admin_dashboard_totals — compteurs pour le tableau de bord admin
-- =======================================================================
CREATE OR REPLACE FUNCTION public.admin_dashboard_totals()
RETURNS TABLE (entity TEXT, total BIGINT)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN QUERY
    SELECT 'demandes'::TEXT,
           COUNT(*)::BIGINT
    FROM public.profiles WHERE access_status = 'pending'
  UNION ALL
    SELECT 'utilisateurs'::TEXT,
           COUNT(*)::BIGINT
    FROM public.profiles WHERE access_status = 'approved'
  UNION ALL
    SELECT 'abonnements'::TEXT, 0::BIGINT
  UNION ALL
    SELECT 'recherches'::TEXT,
           COALESCE(SUM(searches_used), 0)::BIGINT
    FROM public.monthly_usage
    WHERE period_start = date_trunc('month', NOW())::DATE
  UNION ALL
    SELECT 'favoris'::TEXT,
           COUNT(*)::BIGINT
    FROM public.favorites
  UNION ALL
    SELECT 'logs'::TEXT,
           COUNT(*)::BIGINT
    FROM public.audit_logs;
END;
$$;

-- =======================================================================
-- RLS (Row Level Security)
-- =======================================================================
ALTER TABLE public.profiles       ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.organizations   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.monthly_usage   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favorites       ENABLE ROW LEVEL SECURITY;

-- ── Suppression des policies existantes (idempotent) ─────────────────
DROP POLICY IF EXISTS "profiles_self_select"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_self_update"  ON public.profiles;
DROP POLICY IF EXISTS "profiles_admin_all"    ON public.profiles;
DROP POLICY IF EXISTS "orgs_read"             ON public.organizations;
DROP POLICY IF EXISTS "orgs_admin_write"      ON public.organizations;
DROP POLICY IF EXISTS "usage_self"            ON public.monthly_usage;
DROP POLICY IF EXISTS "favorites_self"        ON public.favorites;
DROP POLICY IF EXISTS "auditlogs_admin"       ON public.audit_logs;

-- ── Profiles ────────────────────────────────────────────────────────
CREATE POLICY "profiles_self_select" ON public.profiles
  FOR SELECT USING (id = auth.uid() OR public.is_admin());

CREATE POLICY "profiles_self_update" ON public.profiles
  FOR UPDATE USING (id = auth.uid());

CREATE POLICY "profiles_admin_all" ON public.profiles
  FOR ALL USING (public.is_admin());

-- ── Organizations ────────────────────────────────────────────────────
CREATE POLICY "orgs_read" ON public.organizations
  FOR SELECT USING (auth.uid() IS NOT NULL);

CREATE POLICY "orgs_admin_write" ON public.organizations
  FOR ALL USING (public.is_admin());

-- ── Monthly usage ─────────────────────────────────────────────────────
CREATE POLICY "usage_self" ON public.monthly_usage
  FOR ALL USING (profile_id = auth.uid() OR public.is_admin());

-- ── Favorites ─────────────────────────────────────────────────────────
CREATE POLICY "favorites_self" ON public.favorites
  FOR ALL USING (user_id = auth.uid());

-- ── Audit logs ────────────────────────────────────────────────────────
CREATE POLICY "auditlogs_admin" ON public.audit_logs
  FOR SELECT USING (public.is_admin());


-- =======================================================================
-- COMPTE ADMIN INITIAL
-- =======================================================================
-- IMPORTANT : après avoir créé votre compte via Google/Microsoft sur le site,
-- exécutez cette commande en remplaçant par votre email :
--
-- UPDATE public.profiles
-- SET role = 'admin', access_status = 'approved'
-- WHERE professional_email = 'VOTRE_EMAIL_PRO@domaine.fr';
--
-- =======================================================================
