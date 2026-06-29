-- Migration : search_contacts & search_contacts_secure retournent adresse_ban/cp_ban/ville_ban
-- La "source of truth" est maintenant adresse_ban (normalisée via ban_referentiel).
-- Exécuter dans : Supabase → SQL Editor

-- ── 1. search_contacts : ajoute les colonnes BAN ──────────────────────────────

DROP FUNCTION IF EXISTS search_contacts(text,text,text,text,text,text,integer,integer);

CREATE OR REPLACE FUNCTION public.search_contacts(
  p_nom    TEXT  DEFAULT NULL,
  p_prenom TEXT  DEFAULT NULL,
  p_ville  TEXT  DEFAULT NULL,
  p_cp     TEXT  DEFAULT NULL,
  p_mode   TEXT  DEFAULT 'exact',
  p_tel    TEXT  DEFAULT NULL,
  p_limit  INT   DEFAULT 50,
  p_offset INT   DEFAULT 0
)
RETURNS TABLE (
  id BIGINT, nom TEXT, prenom TEXT, email TEXT,
  telephone TEXT, mobile TEXT,
  adresse TEXT, code_postal TEXT, ville TEXT, source TEXT,
  adresse_ban TEXT, cp_ban TEXT, ville_ban TEXT,
  score REAL, total_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE
  v_tel9 TEXT;
BEGIN
  IF p_tel IS NOT NULL THEN
    v_tel9 := replace(replace(replace(replace(replace(p_tel,' ',''),'-',''),'.',''),'(',''),')','');
    IF v_tel9 LIKE '+33%'  THEN v_tel9 := substr(v_tel9, 4); END IF;
    IF v_tel9 LIKE '0033%' THEN v_tel9 := substr(v_tel9, 5); END IF;
    IF v_tel9 LIKE '0%' AND length(v_tel9) = 10 THEN v_tel9 := substr(v_tel9, 2); END IF;
  END IF;

  IF v_tel9 IS NOT NULL AND p_nom IS NULL AND p_prenom IS NULL THEN
    RETURN QUERY
      SELECT c.id, c.nom, c.prenom, c.email, c.telephone, c.mobile,
             c.adresse, c.code_postal, c.ville, c.source,
             c.adresse_ban, c.cp_ban, c.ville_ban,
             1.0::REAL, COUNT(*) OVER()::BIGINT
        FROM contacts c
        WHERE c.telephone = v_tel9
           OR c.telephone = '0'   || v_tel9
           OR c.telephone = '+33' || v_tel9
           OR c.mobile    = v_tel9
           OR c.mobile    = '0'   || v_tel9
           OR c.mobile    = '+33' || v_tel9
        ORDER BY c.nom, c.prenom
        LIMIT p_limit OFFSET p_offset;
    RETURN;
  END IF;

  RETURN QUERY
    WITH capped AS (
      SELECT c.id, c.nom, c.prenom, c.email, c.telephone, c.mobile,
             c.adresse, c.code_postal, c.ville, c.source,
             c.adresse_ban, c.cp_ban, c.ville_ban,
             (
               CASE WHEN c.email       IS NOT NULL AND c.email       != '' THEN 4 ELSE 0 END +
               CASE WHEN c.telephone   IS NOT NULL AND c.telephone   != '' THEN 4 ELSE 0 END +
               CASE WHEN c.mobile      IS NOT NULL AND c.mobile      != '' THEN 4 ELSE 0 END +
               CASE WHEN COALESCE(c.adresse_ban, c.adresse) IS NOT NULL THEN 2 ELSE 0 END +
               CASE WHEN COALESCE(c.ville_ban, c.ville)     IS NOT NULL THEN 1 ELSE 0 END +
               CASE WHEN COALESCE(c.cp_ban, c.code_postal)  IS NOT NULL THEN 1 ELSE 0 END
             )::REAL AS completeness
        FROM contacts c
        WHERE
          (p_nom IS NULL OR (
            CASE p_mode
              WHEN 'starts_with' THEN lower(c.nom) BETWEEN lower(p_nom) AND lower(p_nom) || chr(1114111)
              WHEN 'ends_with'   THEN lower(c.nom) LIKE '%' || lower(p_nom)
              WHEN 'contains'    THEN lower(c.nom) LIKE '%' || lower(p_nom) || '%'
              ELSE lower(c.nom) = lower(p_nom)
            END
          ))
          AND (p_prenom IS NULL OR (
            CASE p_mode
              WHEN 'starts_with' THEN lower(c.prenom) BETWEEN lower(p_prenom) AND lower(p_prenom) || chr(1114111)
              WHEN 'ends_with'   THEN lower(c.prenom) LIKE '%' || lower(p_prenom)
              WHEN 'contains'    THEN lower(c.prenom) LIKE '%' || lower(p_prenom) || '%'
              ELSE lower(c.prenom) = lower(p_prenom)
            END
          ))
          AND (p_cp IS NULL OR c.code_postal = p_cp)
          AND (c.email IS NOT NULL OR c.telephone IS NOT NULL OR c.mobile IS NOT NULL)
        ORDER BY completeness DESC
        LIMIT 500
    )
    SELECT c.id, c.nom, c.prenom, c.email, c.telephone, c.mobile,
           c.adresse, c.code_postal, c.ville, c.source,
           c.adresse_ban, c.cp_ban, c.ville_ban,
           c.completeness, COUNT(*) OVER()::BIGINT
      FROM capped c
      ORDER BY c.completeness DESC, c.nom, c.prenom
      LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION public.search_contacts(text,text,text,text,text,text,integer,integer) TO authenticated;


-- ── 2. search_contacts_secure : expose les colonnes BAN ───────────────────────

DROP FUNCTION IF EXISTS public.search_contacts_secure(text, text, text, text, text, text, int, int);

CREATE OR REPLACE FUNCTION public.search_contacts_secure(
  p_nom    TEXT DEFAULT NULL,
  p_prenom TEXT DEFAULT NULL,
  p_ville  TEXT DEFAULT NULL,
  p_cp     TEXT DEFAULT NULL,
  p_mode   TEXT DEFAULT 'exact',
  p_tel    TEXT DEFAULT NULL,
  p_limit  INT  DEFAULT 50,
  p_offset INT  DEFAULT 0
)
RETURNS TABLE (
  id BIGINT, nom TEXT, prenom TEXT,
  adresse TEXT, code_postal TEXT, ville TEXT, source TEXT,
  adresse_ban TEXT, cp_ban TEXT, ville_ban TEXT,
  societe TEXT,
  phone_masked TEXT, phone_unlocked BOOLEAN, phone_value TEXT, has_phone BOOLEAN,
  email_masked TEXT, email_unlocked BOOLEAN, email_value TEXT, has_email BOOLEAN,
  score REAL, total_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE
SET search_path = public
AS $$
DECLARE v_org UUID; v_status public.access_status;
BEGIN
  SELECT organization_id, access_status INTO v_org, v_status
    FROM public.profiles WHERE id = auth.uid();
  IF v_org IS NULL OR v_status IN ('rejected', 'suspended') THEN
    RAISE EXCEPTION 'not_allowed';
  END IF;

  RETURN QUERY
  SELECT
    s.id, s.nom, s.prenom,
    s.adresse, s.code_postal, s.ville, s.source,
    s.adresse_ban, s.cp_ban, s.ville_ban,
    c.societe,
    private.mask_phone(COALESCE(NULLIF(s.telephone, ''), NULLIF(s.mobile, ''))),
    (up.id IS NOT NULL),
    CASE WHEN up.id IS NOT NULL THEN up.value ELSE NULL END,
    (COALESCE(NULLIF(s.telephone, ''), NULLIF(s.mobile, '')) IS NOT NULL),
    private.mask_email(s.email),
    (ue.id IS NOT NULL),
    CASE WHEN ue.id IS NOT NULL THEN ue.value ELSE NULL END,
    (NULLIF(s.email, '') IS NOT NULL),
    s.score, s.total_count
  FROM public.search_contacts(p_nom, p_prenom, p_ville, p_cp, p_mode, p_tel, p_limit, p_offset) s
  LEFT JOIN public.contacts c  ON c.id = s.id
  LEFT JOIN public.contact_unlocks up ON up.organization_id = v_org AND up.contact_id = s.id AND up.field_type = 'phone'
  LEFT JOIN public.contact_unlocks ue ON ue.organization_id = v_org AND ue.contact_id = s.id AND ue.field_type = 'email';
END;
$$;

REVOKE ALL ON FUNCTION public.search_contacts_secure(text, text, text, text, text, text, int, int) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.search_contacts_secure(text, text, text, text, text, text, int, int) TO authenticated;
