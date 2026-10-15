-- Preserve the public menu fields granted by the preceding hardening migration,
-- but keep operational barcode lookup behind staff-authorised server paths.
REVOKE SELECT (barcode) ON public.menu_items FROM anon, authenticated;
