-- Restaure la fonction search_contacts originale (version qui fonctionnait)
-- Exécuter dans : Supabase → SQL Editor

DROP FUNCTION IF EXISTS search_contacts(text,text,text,text,text,text,integer,integer);
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,INT,INT);
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT);
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT);
DROP FUNCTION IF EXISTS search_contacts(TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,TEXT,INT,INT);

CREATE OR REPLACE FUNCTION search_contacts(
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
  score REAL, total_count BIGINT
)
LANGUAGE plpgsql SECURITY DEFINER STABLE AS $$
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
             (
               CASE WHEN c.email       IS NOT NULL AND c.email       != '' THEN 4 ELSE 0 END +
               CASE WHEN c.telephone   IS NOT NULL AND c.telephone   != '' THEN 4 ELSE 0 END +
               CASE WHEN c.mobile      IS NOT NULL AND c.mobile      != '' THEN 4 ELSE 0 END +
               CASE WHEN c.adresse     IS NOT NULL AND c.adresse     != '' THEN 2 ELSE 0 END +
               CASE WHEN c.ville       IS NOT NULL AND c.ville       != '' THEN 1 ELSE 0 END +
               CASE WHEN c.code_postal IS NOT NULL AND c.code_postal != '' THEN 1 ELSE 0 END
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
           c.completeness, COUNT(*) OVER()::BIGINT
      FROM capped c
      ORDER BY c.completeness DESC, c.nom, c.prenom
      LIMIT p_limit OFFSET p_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION search_contacts(text,text,text,text,text,text,integer,integer) TO anon;
GRANT EXECUTE ON FUNCTION search_contacts(text,text,text,text,text,text,integer,integer) TO authenticated;
