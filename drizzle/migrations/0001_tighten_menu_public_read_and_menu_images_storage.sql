-- Public visitors only see menu entries that are switched on; staff/admin keep full access via their existing write policies.
DROP POLICY IF EXISTS "cats_public_read" ON public.menu_categories;
CREATE POLICY "cats_public_read" ON public.menu_categories
  FOR SELECT TO anon, authenticated
  USING (active = true);

DROP POLICY IF EXISTS "items_public_read" ON public.menu_items;
CREATE POLICY "items_public_read" ON public.menu_items
  FOR SELECT TO anon, authenticated
  USING (active = true);

DROP POLICY IF EXISTS "mods_public_read" ON public.menu_modifiers;
CREATE POLICY "mods_public_read" ON public.menu_modifiers
  FOR SELECT TO anon, authenticated
  USING (active = true);

-- menu-images is a private bucket served through signed URLs, so only staff need to read/list objects directly.
DROP POLICY IF EXISTS "menu_images_public_read" ON storage.objects;
CREATE POLICY "menu_images_staff_read" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'menu-images'
    AND (public.has_role(auth.uid(), 'admin'::public.app_role) OR public.has_role(auth.uid(), 'staff'::public.app_role))
  );