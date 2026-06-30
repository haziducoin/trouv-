-- Pipeline d'enrichissement INPI/RNE — déjà appliqué en prod via Supabase MCP (juin 2026).
-- Ce fichier documente l'état réel de la base. Idempotent (IF NOT EXISTS partout).

-- ── 1. Statut de traitement sur contacts ─────────────────────────────────────
DO $$ BEGIN
  CREATE TYPE public.rne_enrichment_status AS ENUM ('pending','processing','completed','failed','no_match');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS rne_enrichment_status public.rne_enrichment_status NOT NULL DEFAULT 'pending',
  ADD COLUMN IF NOT EXISTS rne_fonction text,
  ADD COLUMN IF NOT EXISTS rne_matched_at timestamptz;

-- ── 2. Staging entreprises (clé naturelle siren) ─────────────────────────────
CREATE TABLE IF NOT EXISTS public.rne_companies_staging (
  siren                 text PRIMARY KEY,
  denomination          text,
  forme_juridique       text,
  code_naf              text,
  date_immatriculation  date,
  code_postal           text,
  ville                 text,
  raw_json              jsonb,
  imported_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_rne_staging_denomination_trgm
  ON public.rne_companies_staging USING gin (lower(denomination) gin_trgm_ops);

-- ── 3. Staging dirigeants — flatten à l'ingestion (pas de jsonb_array_elements
--      au runtime : trop coûteux à 220M lignes côté contacts) ─────────────────
CREATE TABLE IF NOT EXISTS public.rne_dirigeants_staging (
  id              bigserial PRIMARY KEY,
  siren           text NOT NULL REFERENCES public.rne_companies_staging(siren) ON DELETE CASCADE,
  nom             text NOT NULL,
  prenom          text NOT NULL,
  date_naissance  text,
  qualite         text,
  UNIQUE (siren, nom, prenom, qualite)
);
CREATE INDEX IF NOT EXISTS idx_rne_dirigeants_identite
  ON public.rne_dirigeants_staging (unaccent_immutable(lower(nom)), unaccent_immutable(lower(prenom)));

-- ── 4. Matching par batch (priorité : siren exact > siret tronqué > dirigeant
--      nom+prénom CONFIRMÉ par date_naissance OU cp_ban — jamais nom+prénom seuls,
--      pour éviter les faux positifs sur homonymes à 220M lignes) ─────────────
CREATE OR REPLACE FUNCTION public.rne_match_batch(p_batch_size int DEFAULT 5000)
RETURNS TABLE(processed int, matched int) LANGUAGE plpgsql AS $$
DECLARE
  v_matched   int;
  v_processed int;
BEGIN
  CREATE TEMP TABLE _batch ON COMMIT DROP AS
    SELECT id, nom, prenom, siren, siret, cp_ban, date_naissance
    FROM public.contacts
    WHERE rne_enrichment_status = 'pending'
    LIMIT p_batch_size;

  SELECT count(*) INTO v_processed FROM _batch;

  CREATE TEMP TABLE _resolved ON COMMIT DROP AS
  WITH by_siren AS (
    SELECT b.id, s.siren AS m_siren, s.denomination, s.code_naf, NULL::text AS fonction
    FROM _batch b JOIN public.rne_companies_staging s ON s.siren = b.siren
    WHERE b.siren IS NOT NULL AND b.siren <> ''
  ),
  by_siret AS (
    SELECT b.id, s.siren AS m_siren, s.denomination, s.code_naf, NULL::text AS fonction
    FROM _batch b JOIN public.rne_companies_staging s ON s.siren = left(b.siret, 9)
    WHERE b.siret IS NOT NULL AND length(b.siret) = 14
      AND b.id NOT IN (SELECT id FROM by_siren)
  ),
  by_dirigeant AS (
    SELECT DISTINCT ON (b.id) b.id, d.siren AS m_siren, s.denomination, s.code_naf, d.qualite AS fonction
    FROM _batch b
    JOIN public.rne_dirigeants_staging d
      ON unaccent_immutable(lower(d.nom))    = unaccent_immutable(lower(b.nom))
     AND unaccent_immutable(lower(d.prenom)) = unaccent_immutable(lower(b.prenom))
    JOIN public.rne_companies_staging s ON s.siren = d.siren
    WHERE b.id NOT IN (SELECT id FROM by_siren UNION SELECT id FROM by_siret)
      AND (
            (b.date_naissance IS NOT NULL AND d.date_naissance IS NOT NULL AND b.date_naissance = d.date_naissance)
         OR (b.cp_ban IS NOT NULL AND s.code_postal = b.cp_ban)
      )
    ORDER BY b.id, (d.date_naissance = b.date_naissance) DESC NULLS LAST
  )
  SELECT * FROM by_siren
  UNION ALL SELECT * FROM by_siret
  UNION ALL SELECT * FROM by_dirigeant;

  UPDATE public.contacts c SET
    siren                 = COALESCE(NULLIF(c.siren,''), r.m_siren),
    societe                = COALESCE(NULLIF(c.societe,''), r.denomination),
    code_naf               = COALESCE(NULLIF(c.code_naf,''), r.code_naf),
    rne_fonction            = COALESCE(c.rne_fonction, r.fonction),
    rne_enrichment_status   = 'completed',
    rne_matched_at          = now()
  FROM _resolved r
  WHERE c.id = r.id;
  GET DIAGNOSTICS v_matched = ROW_COUNT;

  UPDATE public.contacts c
  SET rne_enrichment_status = 'no_match'
  WHERE c.id IN (SELECT id FROM _batch)
    AND c.rne_enrichment_status = 'pending';

  RETURN QUERY SELECT v_processed, v_matched;
END;
$$;

-- ── 5. Nettoyage staging — seulement après une passe complète sur contacts.
--      Un DELETE par ligne pendant le traitement perdrait les dirigeants d'une
--      même entreprise pas encore atteints par un batch ultérieur. ───────────
CREATE OR REPLACE FUNCTION public.rne_cleanup_staging()
RETURNS boolean LANGUAGE plpgsql AS $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.contacts WHERE rne_enrichment_status = 'pending') THEN
    RETURN false;
  END IF;
  TRUNCATE public.rne_dirigeants_staging, public.rne_companies_staging;
  RETURN true;
END;
$$;

-- ══════════════════════════════════════════════════════════════════════════
-- DIFFÉRÉ — NE PAS EXÉCUTER MAINTENANT (rien à traiter tant que Step 2 n'a
-- pas tourné). Index partiel nécessaire pour que rne_match_batch() reste
-- rapide une fois que des millions de lignes seront passées à 'completed'/
-- 'no_match' (sinon le planner doit re-scanner les rangs déjà traités à
-- chaque appel — même symptôme que le bug de recherche corrigé plus tôt).
-- Build ~7min sur 220M lignes : lancer via pg_cron + statement_timeout=0,
-- JAMAIS via une connexion classique (timeout DB à 2min).
--
-- ALTER ROLE postgres SET statement_timeout = 0;
-- SELECT cron.schedule('build_rne_pending_idx', '* * * * *', $job$
--   DO $$
--   BEGIN
--     IF pg_try_advisory_lock(564738291) THEN
--       BEGIN
--         SET LOCAL statement_timeout = 0;
--         CREATE INDEX IF NOT EXISTS idx_contacts_rne_pending
--           ON public.contacts (id) WHERE rne_enrichment_status = 'pending';
--       EXCEPTION WHEN OTHERS THEN PERFORM pg_advisory_unlock(564738291); RAISE;
--       END;
--       PERFORM pg_advisory_unlock(564738291);
--     END IF;
--   END $$;
-- $job$);
-- -- attendre indisvalid=true (pg_stat_progress_create_index), puis :
-- SELECT cron.unschedule('build_rne_pending_idx');
-- ALTER ROLE postgres RESET statement_timeout;
-- ══════════════════════════════════════════════════════════════════════════
