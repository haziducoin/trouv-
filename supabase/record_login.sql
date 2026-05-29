-- ============================================================
-- Fonction record_login — appelée après chaque connexion réussie
-- Met à jour last_login_at dans public.profiles
-- ============================================================

CREATE OR REPLACE FUNCTION public.record_login()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.profiles
  SET last_login_at = now()
  WHERE id = auth.uid();
END;
$$;

-- Seuls les utilisateurs authentifiés peuvent appeler cette fonction
REVOKE ALL ON FUNCTION public.record_login() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.record_login() TO authenticated;
