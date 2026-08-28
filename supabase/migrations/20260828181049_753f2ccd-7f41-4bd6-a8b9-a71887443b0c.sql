
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.touch_updated_at() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.enforce_sos_transition() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_team_on_close() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.has_role(uuid, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_operator(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_team_to_sos(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, public.app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_operator(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_team_to_sos(uuid, uuid, boolean) TO authenticated;
