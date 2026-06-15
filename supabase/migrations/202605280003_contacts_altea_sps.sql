-- Migration : table contacts (données internes ALTEA + SPS)
-- Exécuter dans : Supabase → SQL Editor
-- Ou via psql : psql $DATABASE_URL -f 20260528_contacts.sql

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ── Table principale ─────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS contacts (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT        NOT NULL CHECK (source IN ('sps', 'altea')),
  prenom          TEXT        NOT NULL,
  nom             TEXT        NOT NULL,
  date_naissance  DATE,
  adresse         TEXT,
  code_postal     VARCHAR(10),
  ville           TEXT,
  telephone       TEXT,
  email           TEXT,
  organisme       TEXT,
  situation       TEXT,
  -- Clé de dédup : NOM|PRENOM|DATE|CP (calculée côté Python, indexée pour ON CONFLICT)
  norm_key        TEXT        NOT NULL DEFAULT '',
  created_at      TIMESTAMPTZ DEFAULT now()
);

-- Contrainte unique pour la dédup ON CONFLICT lors de l'import
CREATE UNIQUE INDEX IF NOT EXISTS contacts_norm_key_idx ON contacts (norm_key)
  WHERE norm_key <> '';

-- ── Index de recherche ───────────────────────────────────────────────────────
CREATE INDEX IF NOT EXISTS contacts_nom_trgm    ON contacts USING GIN (nom    gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_prenom_trgm ON contacts USING GIN (prenom gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_ville_trgm  ON contacts USING GIN (ville  gin_trgm_ops);
CREATE INDEX IF NOT EXISTS contacts_cp_idx      ON contacts (code_postal);
CREATE INDEX IF NOT EXISTS contacts_source_idx  ON contacts (source);

-- ── Fonction de recherche ────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION search_contacts(
  p_nom     TEXT  DEFAULT NULL,
  p_prenom  TEXT  DEFAULT NULL,
  p_ville   TEXT  DEFAULT NULL,
  p_cp      TEXT  DEFAULT NULL,
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
  )
  SELECT
    f.id, f.source, f.prenom, f.nom, f.date_naissance,
    f.adresse, f.code_postal, f.ville,
    f.telephone, f.email, f.organisme, f.situation,
    COUNT(*) OVER() AS total_count
  FROM filtered f
  ORDER BY f.nom, f.prenom
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

-- ── RLS ──────────────────────────────────────────────────────────────────────
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;

CREATE POLICY contacts_auth_read ON contacts
  FOR SELECT TO authenticated USING (true);

-- ── Import CSV chunks (à exécuter pour chaque fichier chunk_XXXX.csv) ────────
-- Remplacer /chemin/ par le chemin réel des fichiers CSV
--
-- \COPY contacts (source,prenom,nom,date_naissance,adresse,code_postal,ville,telephone,email,organisme,situation,norm_key)
-- FROM '/chemin/chunk_0000.csv'
-- DELIMITER ';' CSV HEADER
-- ON CONFLICT (norm_key) WHERE norm_key <> '' DO NOTHING;
--
-- Répéter pour chaque chunk.
-- Script bash pour tout importer d'un coup :
-- for f in /chemin/chunks/chunk_*.csv; do
--   psql $DATABASE_URL -c "\COPY contacts (...) FROM '$f' DELIMITER ';' CSV HEADER ON CONFLICT DO NOTHING;"
-- done
