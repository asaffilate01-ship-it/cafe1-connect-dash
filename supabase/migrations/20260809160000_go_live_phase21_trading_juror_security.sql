-- Phase 21: enforce the confirmed trading contract and harden Juror ID batches.
--
-- Confirmed operating rules:
--   * dine-in, collection and takeaway: Monday-Friday 08:00-17:00
--   * delivery: Monday-Friday 08:30-16:30, maximum 0.5 miles from AL1 3JU
--   * closed Saturdays, Sundays and England/Wales bank holidays
--   * Cafe 1 is not currently VAT registered
--   * each Juror ID is also its voucher code and remains valid for 12 calendar weeks
--   * redemption is still limited to court working days (never weekends/bank holidays)

ALTER TABLE public.business_settings
  ADD COLUMN IF NOT EXISTS vat_registered boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS vat_number text;

ALTER TABLE public.business_settings
  ALTER COLUMN delivery_open_time SET DEFAULT '08:30',
  ALTER COLUMN delivery_close_time SET DEFAULT '16:30',
  ALTER COLUMN delivery_origin_postcode SET DEFAULT 'AL1 3JU',
  ALTER COLUMN delivery_radius_m SET DEFAULT 805;

UPDATE public.business_settings
SET delivery_open_time = '08:30',
    delivery_close_time = '16:30',
    delivery_origin_postcode = 'AL1 3JU',
    delivery_radius_m = 805,
    vat_registered = false,
    vat_number = NULL,
    updated_at = now();

UPDATE public.business_hours
SET open_time = '08:00',
    close_time = '17:00',
    closed = day_of_week IN (0, 6);

-- Seed the published England and Wales dates beyond the existing 2026 rows so
-- the store status, pre-order slots and juror working-day calculations agree.
INSERT INTO public.bank_holidays (holiday_date, name) VALUES
  ('2027-01-01', 'New Year''s Day'),
  ('2027-03-26', 'Good Friday'),
  ('2027-03-29', 'Easter Monday'),
  ('2027-05-03', 'Early May bank holiday'),
  ('2027-05-31', 'Spring bank holiday'),
  ('2027-08-30', 'Summer bank holiday'),
  ('2027-12-27', 'Christmas Day (substitute day)'),
  ('2027-12-28', 'Boxing Day (substitute day)'),
  ('2028-01-03', 'New Year''s Day (substitute day)'),
  ('2028-04-14', 'Good Friday'),
  ('2028-04-17', 'Easter Monday'),
  ('2028-05-01', 'Early May bank holiday'),
  ('2028-05-29', 'Spring bank holiday'),
  ('2028-08-28', 'Summer bank holiday'),
  ('2028-12-25', 'Christmas Day'),
  ('2028-12-26', 'Boxing Day')
ON CONFLICT (holiday_date) DO UPDATE SET name = EXCLUDED.name;

-- Trading hours, delivery limits, VAT treatment and holiday overrides affect
-- every order. Only a manager with an AAL2 session may change them directly.
DROP POLICY IF EXISTS biz_write ON public.business_settings;
DROP POLICY IF EXISTS hours_write ON public.business_hours;
DROP POLICY IF EXISTS "Staff can manage bank holidays" ON public.bank_holidays;

GRANT UPDATE ON public.business_settings, public.business_hours TO authenticated;

CREATE POLICY business_settings_manager_aal2_write ON public.business_settings
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );

CREATE POLICY business_hours_manager_aal2_write ON public.business_hours
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );

CREATE POLICY bank_holidays_manager_aal2_write ON public.bank_holidays
  FOR ALL TO authenticated
  USING (
    public.has_role(auth.uid(), 'admin')
    AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  )
  WITH CHECK (
    public.has_role(auth.uid(), 'admin')
    AND COALESCE(auth.jwt() ->> 'aal', 'aal1') = 'aal2'
  );

-- Keep one identifier throughout the scheme: the HMCTS Juror ID is stored as
-- the voucher code. Activation is fixed at 12 calendar weeks. Redemption paths
-- call is_court_working_day, so weekends and configured bank holidays never
-- consume or expose an allowance. The operator guard remains manager+AAL2-only.
DROP FUNCTION IF EXISTS public.cafe1_activate_juror_ids(text, text[], date, integer);

CREATE FUNCTION public.cafe1_activate_juror_ids(
  _batch text,
  _juror_ids text[],
  _valid_from date DEFAULT CURRENT_DATE,
  _weeks integer DEFAULT 12
)
RETURNS TABLE(juror_id text, status text, valid_from date, valid_until date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  actor uuid;
  raw text;
  normalised text;
  end_date date;
  holder public.voucher_holders%ROWTYPE;
BEGIN
  actor := public.cafe1_assert_operator(true);
  IF length(trim(COALESCE(_batch, ''))) < 2 OR length(_batch) > 120 THEN
    RAISE EXCEPTION 'A batch label is required';
  END IF;
  IF _juror_ids IS NULL OR array_length(_juror_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Provide at least one Juror ID';
  END IF;
  IF array_length(_juror_ids, 1) > 500 THEN
    RAISE EXCEPTION 'Activate at most 500 Juror IDs at a time';
  END IF;
  IF _weeks <> 12 THEN
    RAISE EXCEPTION 'Juror IDs must be activated for exactly 12 weeks';
  END IF;
  IF _valid_from < CURRENT_DATE - 7 OR _valid_from > CURRENT_DATE + 120 THEN
    RAISE EXCEPTION 'Invalid activation start date';
  END IF;

  end_date := _valid_from + (_weeks * 7) - 1;

  FOREACH raw IN ARRAY _juror_ids LOOP
    normalised := upper(regexp_replace(COALESCE(raw, ''), '[^A-Za-z0-9\-]', '', 'g'));
    IF length(normalised) < 3 OR length(normalised) > 40 THEN
      RAISE EXCEPTION 'A Juror ID in the batch is invalid';
    END IF;

    SELECT * INTO holder
    FROM public.voucher_holders
    WHERE upper(code) = normalised
    FOR UPDATE;

    IF FOUND THEN
      UPDATE public.voucher_holders
      SET active = true,
          deactivated_at = NULL,
          batch = trim(_batch),
          valid_from = _valid_from,
          valid_until = end_date,
          daily_amount_cents = 571,
          attendance_required = true,
          pin_hash = NULL,
          failed_pin_attempts = 0,
          pin_locked_until = NULL,
          opted_in_at = NULL,
          opt_in_source = NULL,
          security_version = 4,
          updated_at = now()
      WHERE id = holder.id
      RETURNING * INTO holder;

      INSERT INTO public.voucher_events (holder_id, code, event, detail, actor_id)
      VALUES (
        holder.id,
        holder.code,
        'credential_rotated',
        format('Batch %s; credentials reset; Juror ID is voucher code; %s weeks; valid %s to %s',
          trim(_batch), _weeks, _valid_from, end_date),
        actor
      );
      status := 'updated';
    ELSE
      INSERT INTO public.voucher_holders (
        code, batch, active, daily_amount_cents, valid_from, valid_until,
        pin_hash, failed_pin_attempts, issued_by, attendance_required, security_version
      ) VALUES (
        normalised, trim(_batch), true, 571, _valid_from, end_date,
        NULL, 0, actor, true, 4
      )
      RETURNING * INTO holder;

      INSERT INTO public.voucher_events (holder_id, code, event, detail, actor_id)
      VALUES (
        holder.id,
        holder.code,
        'issued',
        format('Juror ID activated as voucher code; batch %s; %s weeks; valid %s to %s',
          trim(_batch), _weeks, _valid_from, end_date),
        actor
      );
      status := 'activated';
    END IF;

    juror_id := holder.code;
    valid_from := holder.valid_from;
    valid_until := holder.valid_until;
    RETURN NEXT;
  END LOOP;
END $$;

REVOKE ALL ON FUNCTION public.cafe1_activate_juror_ids(text, text[], date, integer)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cafe1_activate_juror_ids(text, text[], date, integer)
  TO authenticated, service_role;

-- Separate generated voucher codes are no longer part of the HMCTS scheme.
-- Existing audit records remain intact, but no caller can issue another batch.
REVOKE ALL ON FUNCTION public.cafe1_issue_juror_batch(text, integer, date, integer)
  FROM PUBLIC, anon, authenticated, service_role;

-- Correct active Juror IDs created by the earlier flow. The ID remains the
-- voucher code, the validity is exactly 12 calendar weeks, and attendance
-- proof is required online. Non-sitting-day checks remain in every redemption.
UPDATE public.voucher_holders
SET attendance_required = true,
    valid_until = valid_from + 83,
    security_version = 4,
    updated_at = now()
WHERE active = true AND security_version = 3;

UPDATE public.blog_posts
SET body_md = replace(
      replace(body_md, 'open Monday to Friday, 8:30am to 5pm', 'open Monday to Friday, 8am to 5pm'),
      'Breakfast runs from opening at 8:30am',
      'Breakfast runs from opening at 8am'
    ),
    updated_at = now()
WHERE body_md LIKE '%8:30am to 5pm%' OR body_md LIKE '%opening at 8:30am%';

COMMENT ON COLUMN public.business_settings.vat_registered IS
  'Whether the business is VAT registered. Confirmed false for the current Cafe 1 launch.';
COMMENT ON FUNCTION public.cafe1_activate_juror_ids(text, text[], date, integer) IS
  'Manager+AAL2-only activation: Juror ID equals voucher code, fixed 12-week validity, credentials rotate on reuse; redemption is court-working-days only.';
