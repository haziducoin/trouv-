-- Migration : search_contacts avec p_mode (exact/starts_with/contains/ends_with) + p_tel
-- Exécuter dans : Supabase → SQL Editor

-- ── Colonne mobile (si pas encore présente) ──────────────────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mobile TEXT;

-- ── Index trigram sur telephone et mobile ────────────────────────────────────
CREATE INDEX IF NOT EXISTS contacts_tel_trgm    ON contacts USING GIN (telephone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_mobile_trgm ON contacts USING GIN (mobile    gin_trgm_ops);

-- ── Supprime TOUTES les surcharges existantes ────────────────────────────────
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,INT,INT);
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT);
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT);

-- ── Fonction search_contacts : p_mode + p_tel ─────────────────────────────────
CREATE OR REPLACE FUNCTION search_contacts(
  p_nom     TEXT    DEFAULT NULL,
  p_prenom  TEXT    DEFAULT NULL,
  p_ville   TEXT    DEFAULT NULL,
  p_cp      TEXT    DEFAULT NULL,
  p_tel     TEXT    DEFAULT NULL,
  p_mode    TEXT    DEFAULT 'starts_with',  -- 'exact' | 'starts_with' | 'ends_with' | 'contains'
  p_limit   INT     DEFAULT 20,
  p_offset  INT     DEFAULT 0
)
RETURNS TABLE (
  id             BIGINT,
  source         TEXT,
  prenom         TEXT,
  nom            TEXT,
  date_naissance DATE,
  adresse        TEXT,
  code_postal    VARCHAR(10),
  ville          TEXT,
  telephone      TEXT,
  mobile         TEXT,
  email          TEXT,
  organisme      TEXT,
  situation      TEXT,
  total_count    BIGINT
)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_nom_pattern    TEXT;
  v_prenom_pattern TEXT;
  v_ville_pattern  TEXT;
BEGIN
  -- Construire le pattern selon le mode
  v_nom_pattern := CASE
    WHEN p_mode = 'exact'      THEN p_nom
    WHEN p_mode = 'ends_with'  THEN '%' || p_nom
    WHEN p_mode = 'contains'   THEN '%' || p_nom || '%'
    ELSE p_nom || '%'  -- starts_with (défaut)
  END;

  v_prenom_pattern := CASE
    WHEN p_mode = 'exact'      THEN p_prenom
    WHEN p_mode = 'ends_with'  THEN '%' || p_prenom
    WHEN p_mode = 'contains'   THEN '%' || p_prenom || '%'
    ELSE p_prenom || '%'  -- starts_with (défaut)
  END;

  v_ville_pattern := CASE
    WHEN p_mode = 'exact'      THEN p_ville
    WHEN p_mode = 'ends_with'  THEN '%' || p_ville
    WHEN p_mode = 'contains'   THEN '%' || p_ville || '%'
    ELSE p_ville || '%'  -- starts_with (défaut)
  END;

  RETURN QUERY
  WITH filtered AS (
    SELECT c.*
    FROM contacts c
    WHERE
      (p_nom    IS NULL OR c.nom    ILIKE v_nom_pattern)
      AND (p_prenom IS NULL OR c.prenom ILIKE v_prenom_pattern)
      AND (p_ville  IS NULL OR c.ville  ILIKE v_ville_pattern)
      AND (p_cp     IS NULL OR c.code_postal = p_cp)
      AND (p_tel    IS NULL
            OR replace(replace(c.telephone, ' ', ''), '.', '') ILIKE '%' || replace(replace(p_tel, ' ', ''), '.', '') || '%'
            OR replace(replace(c.mobile,    ' ', ''), '.', '') ILIKE '%' || replace(replace(p_tel, ' ', ''), '.', '') || '%')
  )
  SELECT
    f.id, f.source, f.prenom, f.nom, f.date_naissance,
    f.adresse, f.code_postal, f.ville,
    f.telephone, f.mobile, f.email, f.organisme, f.situation,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.nom, f.prenom
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;
