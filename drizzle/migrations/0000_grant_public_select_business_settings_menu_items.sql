-- Public-read policies (biz_read, items_public_read) already allow anon/authenticated
-- SELECT, but the table privileges were missing, so visitors got
-- "permission denied for table business_settings" / menu_items.
GRANT SELECT ON public.business_settings TO anon;
GRANT SELECT ON public.business_settings TO authenticated;
GRANT SELECT ON public.menu_items TO anon;
GRANT SELECT ON public.menu_items TO authenticated;