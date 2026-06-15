-- Migration : search_contacts en SECURITY DEFINER pour bypasser le RLS
-- Permet les recherches même sans session Supabase (mode démo, anon)
-- Exécuter dans : Supabase → SQL Editor

-- ── Drop toutes les surcharges existantes ────────────────────────────────────
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,INT,INT);
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT);
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT);
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT);

-- ── Recrée avec SECURITY DEFINER ─────────────────────────────────────────────
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
LANGUAGE plpgsql
SECURITY DEFINER
STABLE AS $$
BEGIN
  RETURN QUERY
  WITH filtered AS (
    SELECT c.*
    FROM contacts c
    WHERE
      (p_nom    IS NULL OR lower(c.nom)    LIKE lower(p_nom)    || '%')
      AND (p_prenom IS NULL OR lower(c.prenom) LIKE lower(p_prenom) || '%')
      AND (p_ville  IS NULL OR lower(c.ville)  LIKE lower(p_ville)  || '%')
      AND (p_cp     IS NULL OR c.code_postal = p_cp)
      AND (p_tel    IS NULL
            OR replace(replace(c.telephone, ' ', ''), '.', '') ILIKE '%' || replace(replace(p_tel, ' ', ''), '.', '') || '%'
            OR replace(replace(COALESCE(c.mobile, ''), ' ', ''), '.', '') ILIKE '%' || replace(replace(p_tel, ' ', ''), '.', '') || '%')
  )
  SELECT
    f.id, f.source, f.prenom, f.nom, f.date_naissance,
    f.adresse, f.code_postal, f.ville,
    f.telephone,
    COALESCE(f.mobile, NULL) AS mobile,
    f.email, f.organisme, f.situation,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.nom, f.prenom
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ── Droits d'exécution ───────────────────────────────────────────────────────
GRANT EXECUTE ON FUNCTION search_contacts TO anon;
GRANT EXECUTE ON FUNCTION search_contacts TO authenticated;
