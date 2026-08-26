ALTER TABLE public.menu_items
  ADD COLUMN IF NOT EXISTS prep_type text NOT NULL DEFAULT 'none';

ALTER TABLE public.menu_items
  DROP CONSTRAINT IF EXISTS menu_items_prep_type_check;

ALTER TABLE public.menu_items
  ADD CONSTRAINT menu_items_prep_type_check
  CHECK (prep_type IN ('none','prep','hot'));

UPDATE public.menu_items
SET prep_type = CASE WHEN needs_cooking THEN 'hot' ELSE 'none' END;