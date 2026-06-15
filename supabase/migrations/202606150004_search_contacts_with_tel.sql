-- Migration : ajout colonne mobile + index tel/mobile + p_tel dans search_contacts
-- Exécuter dans : Supabase → SQL Editor

-- ── Colonne mobile (si pas encore présente) ──────────────────────────────────
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS mobile TEXT;

-- ── Index sur telephone et mobile ────────────────────────────────────────────
-- Trigram pour recherche partielle (ILIKE '%xx%')
CREATE INDEX IF NOT EXISTS contacts_tel_trgm    ON contacts USING GIN (telephone gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_mobile_trgm ON contacts USING GIN (mobile    gin_trgm_ops);

-- ── Mise à jour de search_contacts avec p_tel ─────────────────────────────────
CREATE OR REPLACE FUNCTION search_contacts(
  p_nom     TEXT  DEFAULT NULL,
  p_prenom  TEXT  DEFAULT NULL,
  p_ville   TEXT  DEFAULT NULL,
  p_cp      TEXT  DEFAULT NULL,
  p_tel     TEXT  DEFAULT NULL,
  p_limit   INT   DEFAULT 20,
  p_offset  INT   DEFAULT 0
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
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT c.*
    FROM contacts c
    WHERE
      (p_nom    IS NULL OR c.nom    ILIKE p_nom    || '%')
      AND (p_prenom IS NULL OR c.prenom ILIKE p_prenom || '%')
      AND (p_ville  IS NULL OR c.ville  ILIKE p_ville  || '%')
      AND (p_cp     IS NULL OR c.code_postal = p_cp)
      AND (p_tel    IS NULL
            OR c.telephone ILIKE '%' || p_tel || '%'
            OR c.mobile    ILIKE '%' || p_tel || '%')
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
