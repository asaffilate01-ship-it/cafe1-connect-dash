REVOKE EXECUTE ON FUNCTION public.cafe1_assert_landlord() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cafe1_is_landlord(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.cafe1_set_prepared_by(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.court_staff_profile(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.cafe1_assert_landlord() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cafe1_is_landlord(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cafe1_set_prepared_by(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.court_staff_profile(uuid) TO authenticated, service_role;