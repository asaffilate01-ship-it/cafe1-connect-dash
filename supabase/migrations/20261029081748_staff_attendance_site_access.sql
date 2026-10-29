-- Drivers are registered staff too; allow them to choose a site in Hours & pay.
CREATE OR REPLACE FUNCTION public.cafe1_list_sites()
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF auth.uid() IS NULL OR NOT (public.has_role(auth.uid(),'admin') OR public.has_role(auth.uid(),'staff') OR public.has_role(auth.uid(),'driver')) THEN RAISE EXCEPTION 'Registered staff only'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(s) ORDER BY s.name),'[]'::jsonb) INTO result FROM public.sites s;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.cafe1_list_sites() FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cafe1_list_sites() TO authenticated;
