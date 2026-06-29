-- Migration : Normalisation des adresses via jointure interne sur ban_referentiel
-- Exécuter dans : Supabase → SQL Editor

-- ── Extensions ───────────────────────────────────────────────────────────────

CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Nouvelles colonnes sur contacts ──────────────────────────────────────────

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS adresse_ban       TEXT,
  ADD COLUMN IF NOT EXISTS cp_ban            VARCHAR(5),
  ADD COLUMN IF NOT EXISTS ville_ban         TEXT,
  ADD COLUMN IF NOT EXISTS adresse_ban_score FLOAT DEFAULT 0,
  ADD COLUMN IF NOT EXISTS adresse_ban_at    TIMESTAMPTZ;

-- Index partiel : uniquement les lignes pas encore normalisées (filtre efficace)
CREATE INDEX IF NOT EXISTS idx_contacts_ban_pending
  ON public.contacts (code_postal, id)
  WHERE adresse_ban IS NULL AND adresse IS NOT NULL AND code_postal IS NOT NULL;

-- Index sur ban_referentiel pour accélérer les jointures
CREATE INDEX IF NOT EXISTS idx_ban_ref_cp
  ON public.ban_referentiel (code_postal);

CREATE INDEX IF NOT EXISTS idx_ban_ref_commune_lower
  ON public.ban_referentiel (code_postal, lower(nom_commune));

-- ── Fonction de normalisation par batch ──────────────────────────────────────
-- Appelée via RPC : SELECT * FROM normalize_contacts_ban(10000);

CREATE OR REPLACE FUNCTION public.normalize_contacts_ban(
  p_batch_size INT DEFAULT 10000
)
RETURNS TABLE (processed BIGINT, matched BIGINT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_matched BIGINT := 0;
  v_processed BIGINT := 0;
BEGIN

  -- Sélectionne un lot de contacts à normaliser, puis tente la jointure BAN
  WITH batch AS (
    SELECT id FROM public.contacts
    WHERE adresse_ban IS NULL
      AND adresse IS NOT NULL
      AND code_postal IS NOT NULL
    ORDER BY id
    LIMIT p_batch_size
  ),
  updated AS (
    UPDATE public.contacts AS c
    SET
      adresse_ban       = b.nom_voie,
      cp_ban            = b.code_postal,
      ville_ban         = b.nom_commune,
      adresse_ban_score = 1.0,
      adresse_ban_at    = NOW()
    FROM public.ban_referentiel b
    WHERE c.id IN (SELECT id FROM batch)
      AND c.code_postal = b.code_postal
      AND unaccent(lower(c.ville))    = unaccent(lower(b.nom_commune))
      AND unaccent(lower(c.adresse)) LIKE '%' || unaccent(lower(b.nom_voie)) || '%'
    RETURNING c.id
  )
  SELECT COUNT(*) INTO v_matched FROM updated;

  -- Marque les contacts du batch sans correspondance pour ne pas les retraiter
  UPDATE public.contacts
  SET adresse_ban_at = NOW(), adresse_ban_score = 0
  WHERE id IN (
    SELECT id FROM public.contacts
    WHERE adresse_ban IS NULL
      AND adresse IS NOT NULL
      AND code_postal IS NOT NULL
    ORDER BY id
    LIMIT p_batch_size
  )
  AND adresse_ban IS NULL;

  GET DIAGNOSTICS v_processed = ROW_COUNT;
  v_processed := v_processed + v_matched;

  RETURN QUERY SELECT v_processed, v_matched;
END;
$$;

COMMENT ON FUNCTION public.normalize_contacts_ban IS
  'Normalise un batch de contacts via jointure sur ban_referentiel. '
  'Lancer en boucle jusqu''à ce que processed = 0.';
