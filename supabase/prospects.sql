-- =======================================================================
-- trouvé! — Table prospects (base de données propriétaire)
-- Exécuter dans : Supabase Dashboard → SQL Editor → New query
-- =======================================================================

-- ─── Table principale ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.prospects (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identité
  first_name      TEXT,
  last_name       TEXT,
  job_title       TEXT,                 -- "Directeur commercial", "Responsable..."

  -- Entreprise
  company_name    TEXT,
  company_siren   TEXT,
  activity_code   TEXT,                 -- Code NAF (ex: 6831Z)
  activity_label  TEXT,
  company_size    TEXT,                 -- Tranche effectif INSEE (ex: '12' = 20-49)
  company_type    TEXT,                 -- Forme juridique (SAS, SARL…)

  -- Coordonnées
  email           TEXT,
  phone           TEXT,
  phone_mobile    TEXT,
  linkedin_url    TEXT,
  website         TEXT,

  -- Localisation
  address         TEXT,
  city            TEXT,
  zip_code        TEXT,
  department      TEXT,                 -- Code dept 2 chiffres (ex: '75')
  region          TEXT,                 -- Nom région

  -- Méta
  source          TEXT,                 -- Origine de la donnée (import, scrape…)
  is_active       BOOLEAN NOT NULL DEFAULT TRUE,
  created_at      TIMESTAMPTZ DEFAULT NOW(),
  updated_at      TIMESTAMPTZ DEFAULT NOW()
);

-- ─── Index full-text (recherche française) ────────────────────────────
CREATE INDEX IF NOT EXISTS prospects_fts_idx ON public.prospects
  USING GIN (
    to_tsvector('french',
      COALESCE(first_name,    '') || ' ' ||
      COALESCE(last_name,     '') || ' ' ||
      COALESCE(company_name,  '') || ' ' ||
      COALESCE(job_title,     '') || ' ' ||
      COALESCE(city,          '') || ' ' ||
      COALESCE(email,         '') || ' ' ||
      COALESCE(phone,         '') || ' ' ||
      COALESCE(phone_mobile,  '')
    )
  );

-- ─── Index filtres rapides ─────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS prospects_dept_idx      ON public.prospects (department);
CREATE INDEX IF NOT EXISTS prospects_zip_idx       ON public.prospects (zip_code);
CREATE INDEX IF NOT EXISTS prospects_activity_idx  ON public.prospects (activity_code);
CREATE INDEX IF NOT EXISTS prospects_size_idx      ON public.prospects (company_size);
CREATE INDEX IF NOT EXISTS prospects_active_idx    ON public.prospects (is_active);
CREATE INDEX IF NOT EXISTS prospects_siren_idx     ON public.prospects (company_siren);

-- ─── Trigger updated_at ───────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.set_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS prospects_updated_at ON public.prospects;
CREATE TRIGGER prospects_updated_at
  BEFORE UPDATE ON public.prospects
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ─── RLS ──────────────────────────────────────────────────────────────
ALTER TABLE public.prospects ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "prospects_approved_read" ON public.prospects;
DROP POLICY IF EXISTS "prospects_admin_all"     ON public.prospects;

-- Seuls les comptes approuvés peuvent lire
CREATE POLICY "prospects_approved_read" ON public.prospects
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid()
        AND access_status = 'approved'
    )
  );

-- Admin : lecture + écriture totale
CREATE POLICY "prospects_admin_all" ON public.prospects
  FOR ALL USING (public.is_admin());

-- =======================================================================
-- RPC : search_prospects — recherche full-text + filtres côté serveur
-- Retourne : résultats paginés + total
-- =======================================================================
CREATE OR REPLACE FUNCTION public.search_prospects(
  p_query         TEXT    DEFAULT '',
  p_department    TEXT    DEFAULT '',
  p_activity_code TEXT    DEFAULT '',
  p_zip_code      TEXT    DEFAULT '',
  p_employee_range TEXT   DEFAULT '',
  p_legal_form    TEXT    DEFAULT '',
  p_page          INTEGER DEFAULT 1,
  p_per_page      INTEGER DEFAULT 20
)
RETURNS TABLE (
  id            UUID,
  first_name    TEXT,
  last_name     TEXT,
  job_title     TEXT,
  company_name  TEXT,
  company_siren TEXT,
  activity_code TEXT,
  activity_label TEXT,
  company_size  TEXT,
  company_type  TEXT,
  email         TEXT,
  phone         TEXT,
  phone_mobile  TEXT,
  linkedin_url  TEXT,
  website       TEXT,
  address       TEXT,
  city          TEXT,
  zip_code      TEXT,
  department    TEXT,
  region        TEXT,
  is_active     BOOLEAN,
  created_at    TIMESTAMPTZ,
  total_count   BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public AS $$
DECLARE
  v_offset INTEGER := (p_page - 1) * p_per_page;
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT p.*,
           COUNT(*) OVER () AS _total
    FROM   public.prospects p
    WHERE
      (p_query = '' OR
        to_tsvector('french',
          COALESCE(p.first_name,   '') || ' ' ||
          COALESCE(p.last_name,    '') || ' ' ||
          COALESCE(p.company_name, '') || ' ' ||
          COALESCE(p.job_title,    '') || ' ' ||
          COALESCE(p.city,         '') || ' ' ||
          COALESCE(p.email,        '') || ' ' ||
          COALESCE(p.phone,        '') || ' ' ||
          COALESCE(p.phone_mobile, '')
        ) @@ websearch_to_tsquery('french', p_query)
      )
      AND (p_department    = '' OR p.department    = p_department)
      AND (p_activity_code = '' OR p.activity_code = p_activity_code)
      AND (p_zip_code      = '' OR p.zip_code      = p_zip_code)
      AND (p_employee_range= '' OR p.company_size  = p_employee_range)
      AND (p_legal_form    = '' OR p.company_type ILIKE '%' || p_legal_form || '%')
    ORDER BY
      CASE WHEN p_query <> '' THEN
        ts_rank(
          to_tsvector('french',
            COALESCE(p.first_name,'') || ' ' || COALESCE(p.last_name,'') || ' ' ||
            COALESCE(p.company_name,'') || ' ' || COALESCE(p.job_title,'')
          ),
          websearch_to_tsquery('french', p_query)
        )
      ELSE 0 END DESC,
      p.created_at DESC
    LIMIT  p_per_page
    OFFSET v_offset
  )
  SELECT
    f.id, f.first_name, f.last_name, f.job_title,
    f.company_name, f.company_siren, f.activity_code, f.activity_label,
    f.company_size, f.company_type,
    f.email, f.phone, f.phone_mobile, f.linkedin_url, f.website,
    f.address, f.city, f.zip_code, f.department, f.region,
    f.is_active, f.created_at, f._total
  FROM filtered f;
END;
$$;
