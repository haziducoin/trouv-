-- ─── Migration 202606180011 : restauration record_search + get_search_history ─
-- La migration b2b_compliance avait remplacé record_search par une version
-- qui écrivait uniquement dans audit_logs, perdant l'écriture dans public.searches
-- et le contrôle de quota. Cette migration restaure le comportement complet.

-- ─── record_search : écriture dans searches + audit_logs + contrôle quota ──────
CREATE OR REPLACE FUNCTION public.record_search(
  p_query_label  text,
  p_filters      jsonb    DEFAULT '{}'::jsonb,
  p_result_count integer  DEFAULT 0
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
DECLARE
  v_uid    uuid := auth.uid();
  v_profile public.profiles;
  v_period  date := date_trunc('month', current_date)::date;
  v_usage   integer;
BEGIN
  IF NOT private.is_approved() THEN
    RAISE EXCEPTION 'Compte valide requis';
  END IF;

  SELECT * INTO v_profile FROM public.profiles WHERE id = v_uid;

  -- Incrément quota mensuel (ON CONFLICT pour idempotence)
  INSERT INTO public.monthly_usage (user_id, organization_id, period_start, searches_used)
  VALUES (v_uid, v_profile.organization_id, v_period, 1)
  ON CONFLICT (user_id, period_start) DO UPDATE
    SET searches_used = public.monthly_usage.searches_used + 1,
        updated_at    = now()
    WHERE public.monthly_usage.searches_used < v_profile.monthly_search_quota
  RETURNING searches_used INTO v_usage;

  IF v_usage IS NULL OR v_usage > v_profile.monthly_search_quota THEN
    RAISE EXCEPTION 'Quota mensuel atteint';
  END IF;

  -- Historique utilisateur
  INSERT INTO public.searches (user_id, organization_id, query_label, filters, result_count)
  VALUES (v_uid, v_profile.organization_id, p_query_label, p_filters, p_result_count);

  -- Journal de conformité
  INSERT INTO public.audit_logs (actor_id, organization_id, action, metadata)
  VALUES (v_uid, v_profile.organization_id, 'search',
    jsonb_build_object('query', p_query_label, 'filters', p_filters, 'results', p_result_count));
END;
$$;

REVOKE ALL ON FUNCTION public.record_search(text, jsonb, integer) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.record_search(text, jsonb, integer) TO authenticated;


-- ─── get_search_history : lecture de l'historique utilisateur ────────────────
CREATE OR REPLACE FUNCTION public.get_search_history(
  p_limit  integer DEFAULT 50,
  p_offset integer DEFAULT 0
)
RETURNS TABLE (
  id            uuid,
  query_label   text,
  filters       jsonb,
  result_count  integer,
  created_at    timestamptz
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  RETURN QUERY
  SELECT s.id, s.query_label, s.filters, s.result_count, s.created_at
  FROM   public.searches s
  WHERE  s.user_id = auth.uid()
  ORDER  BY s.created_at DESC
  LIMIT  p_limit
  OFFSET p_offset;
END;
$$;

REVOKE ALL ON FUNCTION public.get_search_history(integer, integer) FROM public, anon;
GRANT  EXECUTE ON FUNCTION public.get_search_history(integer, integer) TO authenticated;
