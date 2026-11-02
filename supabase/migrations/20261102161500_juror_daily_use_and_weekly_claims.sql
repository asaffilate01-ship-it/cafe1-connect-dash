-- Cafe 1 juror scheme: daily participation by SETTLED VOUCHER USE, not enrolment.
-- Court agreement and actual deployment are separate operational gates.
-- Forward-only: do not edit historical juror migrations.
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- All date-sensitive reads use the St Albans court calendar.
CREATE OR REPLACE FUNCTION public.cafe1_court_today()
RETURNS date LANGUAGE sql STABLE SET search_path = public
AS $fn$ SELECT (now() AT TIME ZONE 'Europe/London')::date $fn$;
REVOKE ALL ON FUNCTION public.cafe1_court_today() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cafe1_court_today() TO authenticated, service_role;

-- Exactly one rule for when a juror has used the funded scheme on a day.
-- A held voucher or pending/declined/refunded/cancelled order is NOT daily opt-in.
CREATE OR REPLACE FUNCTION public.cafe1_is_juror_daily_participant(_holder_id uuid, _date date)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, pg_temp
AS $fn$
  SELECT EXISTS (
    SELECT 1 FROM public.voucher_redemptions r
    JOIN public.orders o ON o.id = r.order_id
    WHERE r.holder_id = _holder_id AND r.for_date = _date
      AND r.amount_cents > 0
      AND o.payment_status IN ('paid', 'on_account')
      AND o.status NOT IN ('cancelled', 'refunded')
      AND COALESCE(o.refunded_cents, 0) = 0
  );
$fn$;
REVOKE ALL ON FUNCTION public.cafe1_is_juror_daily_participant(uuid,date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cafe1_is_juror_daily_participant(uuid,date) TO service_role;

-- Confidential ID-only, read-only balance. Only the throttled server function
-- may call this RPC with a service connection; raw anon clients cannot.
-- No names, phone numbers, case details, PINs, or trial information returned.
CREATE OR REPLACE FUNCTION public.cafe1_juror_daily_status_by_id(_code text)
RETURNS TABLE (
  juror_code text, for_date date, allocated_cents integer,
  used_cents integer, held_cents integer, remaining_cents integer,
  opted_in_today boolean, valid_until date, status text
) LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  h public.voucher_holders%ROWTYPE;
  court_date date := public.cafe1_court_today();
  allowance integer := 0;
  total_used integer := 0;
  total_held integer := 0;
  daily_status text := 'ok';
BEGIN
  IF _code IS NULL OR trim(_code) !~ '^[A-Za-z0-9-]{3,40}$' THEN RETURN; END IF;
  SELECT * INTO h FROM public.voucher_holders v
    WHERE upper(v.code) = upper(trim(_code)) LIMIT 1;
  IF NOT FOUND THEN RETURN; END IF;
  IF NOT h.active THEN daily_status := 'inactive';
  ELSIF court_date < h.valid_from THEN daily_status := 'not_started';
  ELSIF h.valid_until IS NOT NULL AND court_date > h.valid_until THEN daily_status := 'expired';
  ELSIF NOT public.is_court_working_day(court_date) THEN daily_status := 'non_sitting_day';
  END IF;

  IF daily_status = 'ok' THEN
    SELECT COALESCE(a.amount_cents, h.daily_amount_cents) INTO allowance
    FROM (SELECT 1) dummy
    LEFT JOIN public.voucher_allocations a
      ON a.holder_id = h.id AND a.for_date = court_date;
  END IF;
  SELECT COALESCE(SUM(CASE WHEN o.payment_status IN ('paid','on_account')
                   AND o.status NOT IN ('cancelled','refunded')
                   AND COALESCE(o.refunded_cents,0) = 0
                   THEN r.amount_cents ELSE 0 END),0)::integer,
         COALESCE(SUM(CASE WHEN r.order_id IS NULL OR
                   (o.payment_status NOT IN ('paid','on_account')
                    AND o.status NOT IN ('cancelled','refunded'))
                   THEN r.amount_cents ELSE 0 END),0)::integer
    INTO total_used,total_held
    FROM public.voucher_redemptions r
    LEFT JOIN public.orders o ON o.id = r.order_id
    WHERE r.holder_id = h.id AND r.for_date = court_date;
  RETURN QUERY SELECT h.code, court_date, allowance, total_used, total_held,
    GREATEST(0, allowance - total_used - total_held),
    public.cafe1_is_juror_daily_participant(h.id,court_date), h.valid_until, daily_status;
END $fn$;
REVOKE ALL ON FUNCTION public.cafe1_juror_daily_status_by_id(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cafe1_juror_daily_status_by_id(text) TO service_role;

-- PIN enrolment is CREDENTIAL SETUP, not daily opt-in.
-- First real funded purchase creates the day's participation automatically.
CREATE OR REPLACE FUNCTION public.juror_opt_in_with_id(_code text, _source text DEFAULT 'online')
RETURNS TABLE(ok boolean, message text, pin text, already boolean, valid_until date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $fn$
DECLARE
  h public.voucher_holders%ROWTYPE;
  pbytes bytea;
  generated_pin text;
  court_date date := public.cafe1_court_today();
BEGIN
  IF _code IS NULL OR trim(_code) !~ '^[A-Za-z0-9-]{3,40}$' THEN
    RETURN QUERY SELECT false,'Enter your Juror ID exactly as issued by the court.',NULL::text,false,NULL::date;
    RETURN;
  END IF;
  SELECT * INTO h FROM public.voucher_holders v
    WHERE upper(v.code) = upper(trim(_code)) FOR UPDATE;
  IF NOT FOUND OR NOT h.active OR h.valid_from > court_date OR
    (h.valid_until IS NOT NULL AND h.valid_until < court_date) THEN
    RETURN QUERY SELECT false,'That Juror ID is not currently available. Ask the Café 1 team.',NULL::text,false,NULL::date;
    RETURN;
  END IF;
  IF h.pin_hash IS NOT NULL THEN
    RETURN QUERY SELECT true,
       'Security PIN already set. Enter your PIN when redeeming; browsing does not opt you in.',
       NULL::text,true,h.valid_until;
    RETURN;
  END IF;
  pbytes := gen_random_bytes(4);
  generated_pin := lpad((
      (get_byte(pbytes,0)::bigint * 16777216
      + get_byte(pbytes,1)::bigint * 65536
      + get_byte(pbytes,2)::bigint * 256
      + get_byte(pbytes,3)::bigint) % 1000000
    )::text,6,'0');
  UPDATE public.voucher_holders
    SET pin_hash = crypt(generated_pin, gen_salt('bf',11)),
        failed_pin_attempts=0,pin_locked_until=NULL,
        -- Never mark a juror opted in for a whole service by setting up a PIN.
        opted_in_at=NULL,opt_in_source=NULL,security_version=4,updated_at=now()
    WHERE id=h.id;
  INSERT INTO public.voucher_events(holder_id,code,event,detail)
    VALUES (h.id,h.code,'pin_issued','Private PIN issued for voucher spending; no daily claim made');
  RETURN QUERY SELECT true,
    'PIN set. You choose on each day by using the voucher. No use means no claim.',
    generated_pin,false,h.valid_until;
END $fn$;
REVOKE ALL ON FUNCTION public.juror_opt_in_with_id(text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.juror_opt_in_with_id(text,text) TO service_role;

-- Preserve legacy RPC signature but stop it silently creating a service-long opt-in.
CREATE OR REPLACE FUNCTION public.opt_in_voucher_secure(_code text,_pin text,_source text)
RETURNS TABLE(ok boolean,message text,already boolean)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  v record;
BEGIN
  SELECT * INTO v FROM public.verify_juror_voucher_credentials(_code,_pin) LIMIT 1;
  IF NOT FOUND OR v.status <> 'ok' THEN
    RETURN QUERY SELECT false,'The Juror ID or PIN is not eligible today.',false;
    RETURN;
  END IF;
  RETURN QUERY SELECT true,
    'PIN confirmed. Daily participation starts only when you redeem a voucher.',
    COALESCE(v.opted_in,false);
END $fn$;
REVOKE ALL ON FUNCTION public.opt_in_voucher_secure(text,text,text) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.opt_in_voucher_secure(text,text,text) TO service_role;

-- Duplicate Juror IDs in successive weekly lists must NOT reset a current
-- juror's PIN or restart their 12-week period.
DROP FUNCTION IF EXISTS public.cafe1_activate_juror_ids(text,text[],date,integer);
CREATE FUNCTION public.cafe1_activate_juror_ids(
  _batch text,_juror_ids text[],_valid_from date DEFAULT CURRENT_DATE,_weeks integer DEFAULT 12
)
RETURNS TABLE(juror_id text,status text,valid_from date,valid_until date)
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
DECLARE
  actor uuid;
  raw text;
  normalized text;
  end_date date;
  h public.voucher_holders%ROWTYPE;
  today_local date := public.cafe1_court_today();
BEGIN
  actor:=public.cafe1_assert_operator(true);
  IF length(trim(coalesce(_batch,''))) < 2 OR length(_batch)>120 THEN RAISE EXCEPTION 'Batch label is required'; END IF;
  IF _juror_ids IS NULL OR array_length(_juror_ids,1) IS NULL OR array_length(_juror_ids,1)>500 THEN
    RAISE EXCEPTION 'Provide between 1 and 500 Juror IDs';
  END IF;
  IF _weeks <> 12 THEN RAISE EXCEPTION 'Juror IDs must be activated for exactly 12 weeks'; END IF;
  IF _valid_from < today_local-7 OR _valid_from>today_local+120 THEN
    RAISE EXCEPTION 'Invalid batch start date';
  END IF;
  end_date := _valid_from + (_weeks * 7) - 1;
  FOREACH raw IN ARRAY _juror_ids LOOP
    normalized:=upper(trim(coalesce(raw,'')));
    IF normalized !~ '^[A-Z0-9-]{3,40}$' THEN RAISE EXCEPTION 'Invalid Juror ID in list'; END IF;
    SELECT * INTO h FROM public.voucher_holders WHERE upper(code)=normalized FOR UPDATE;
    IF FOUND AND h.valid_until >= today_local THEN
      -- Recurring lists may neither restart an existing PIN/12-week window
      -- nor silently re-enable a Juror ID deliberately suspended by staff.
      INSERT INTO public.voucher_events(holder_id,code,event,detail,actor_id)
      VALUES (h.id,h.code,
        CASE WHEN h.active THEN 'batch_repeat' ELSE 'batch_inactive_ignored' END,
        CASE WHEN h.active
          THEN 'Existing Juror ID retained from new Jury Office batch: '||left(trim(_batch),80)
          ELSE 'Inactive Juror ID in weekly list: manager reactivation is required'
        END,actor);
      status:='updated';
    ELSIF FOUND THEN
      UPDATE public.voucher_holders
        SET active=true,deactivated_at=NULL,batch=trim(_batch),
            valid_from=_valid_from, valid_until=end_date,daily_amount_cents=571,
            attendance_required=true,
            pin_hash=NULL, failed_pin_attempts=0, pin_locked_until=NULL,
            opted_in_at=NULL,opt_in_source=NULL,security_version=4,updated_at=now()
        WHERE id=h.id RETURNING * INTO h;
      INSERT INTO public.voucher_events(holder_id,code,event,detail,actor_id)
      VALUES(h.id,h.code,'credential_rotated',
        format('New 12-week service, credentials reset; batch %s; valid %s to %s',trim(_batch),_valid_from,end_date),actor);
      status:='updated';
    ELSE
      INSERT INTO public.voucher_holders(
        code,batch,active,daily_amount_cents,valid_from,valid_until,
        pin_hash,failed_pin_attempts,issued_by,attendance_required,security_version
      ) VALUES (
        normalized,trim(_batch),true,571,_valid_from,end_date,
        NULL,0,actor,true,4
      ) RETURNING * INTO h;
      INSERT INTO public.voucher_events(holder_id,code,event,detail,actor_id)
      VALUES(h.id,h.code,'issued',
        format('Juror ID activated; batch %s; 12 weeks; valid %s to %s',trim(_batch),_valid_from,end_date),actor);
      status:='activated';
    END IF;
    juror_id:=h.code;
    valid_from:=h.valid_from;
    valid_until:=h.valid_until;
    RETURN NEXT;
  END LOOP;
END $fn$;
REVOKE ALL ON FUNCTION public.cafe1_activate_juror_ids(text,text[],date,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cafe1_activate_juror_ids(text,text[],date,integer) TO authenticated,service_role;

-- Itemised claim source, avoiding all cancelled / pending / refunded orders,
-- even if a payment was settled before a refund was issued.
CREATE OR REPLACE FUNCTION public.get_juror_claim_rows(_from date,_to date)
RETURNS TABLE(
  redemption_id uuid,holder_id uuid,for_date date,amount_cents integer,
  redeemed_at timestamptz,order_id uuid,order_number integer,voucher_code text,batch text
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $fn$
  SELECT r.id,r.holder_id,r.for_date,r.amount_cents,r.created_at,
         r.order_id,o.order_number,h.code,h.batch
  FROM public.voucher_redemptions r
  JOIN public.orders o ON o.id=r.order_id
  JOIN public.voucher_holders h ON h.id=r.holder_id
  WHERE r.for_date BETWEEN _from AND _to
    AND r.amount_cents>0
    AND o.payment_status IN ('paid','on_account')
    AND o.status NOT IN ('cancelled','refunded')
    AND COALESCE(o.refunded_cents,0)=0
  ORDER BY r.for_date,h.code,r.created_at;
$fn$;
REVOKE ALL ON FUNCTION public.get_juror_claim_rows(date,date) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_juror_claim_rows(date,date) TO service_role;

COMMENT ON FUNCTION public.cafe1_juror_daily_status_by_id(text)
IS 'ID-only read-only juror daily balance through a throttled server action; never authorises voucher spending';
COMMENT ON FUNCTION public.cafe1_is_juror_daily_participant(uuid,date)
IS 'Daily opt-in requires a positive redemption attached to a settled non-cancelled non-refunded order';


-- Replace legacy, permanent opt-in / UTC-date balance verification.
CREATE OR REPLACE FUNCTION public.verify_juror_voucher_credentials(_code text, _pin text)
RETURNS TABLE(
  holder_id uuid, holder_name text, code text,
  allocated_cents integer, used_cents integer, remaining_cents integer,
  valid_from date, valid_until date, opted_in boolean,
  jury_room text, attendance_required boolean, attendance_verified boolean,
  status text
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  h public.voucher_holders%ROWTYPE;
  alloc integer := 0;
  used integer := 0;
  st text := 'ok';
  present_today boolean := false;
  failures integer;
BEGIN
  IF _code IS NULL OR trim(_code) = '' OR _pin IS NULL OR _pin !~ '^[0-9]{6}$' THEN RETURN; END IF;

  SELECT * INTO h
  FROM public.voucher_holders v
  WHERE upper(v.code) = upper(trim(_code))
  FOR UPDATE;
  IF NOT FOUND THEN RETURN; END IF;

  IF h.pin_locked_until IS NOT NULL AND h.pin_locked_until > now() THEN
    st := 'locked';
  ELSIF h.pin_hash IS NULL OR crypt(_pin, h.pin_hash) <> h.pin_hash THEN
    failures := h.failed_pin_attempts + 1;
    UPDATE public.voucher_holders
    SET failed_pin_attempts = failures,
        pin_locked_until = CASE WHEN failures >= 5 THEN now() + interval '15 minutes' ELSE NULL END,
        updated_at = now()
    WHERE id = h.id;
    IF failures = 5 THEN
      INSERT INTO public.voucher_events (holder_id, code, event, detail)
      VALUES (h.id, h.code, 'pin_locked', 'Five failed PIN attempts; locked for 15 minutes');
    END IF;
    RETURN;
  ELSE
    UPDATE public.voucher_holders
    SET failed_pin_attempts = 0,
        pin_locked_until = NULL,
        last_pin_verified_at = now(),
        updated_at = now()
    WHERE id = h.id;
  END IF;

  IF st = 'ok' THEN
    IF h.active IS NOT TRUE THEN st := 'inactive';
    ELSIF public.cafe1_court_today() < h.valid_from THEN st := 'not_started';
    ELSIF h.valid_until IS NOT NULL AND public.cafe1_court_today() > h.valid_until THEN st := 'expired';
    ELSIF NOT public.is_court_working_day(public.cafe1_court_today()) THEN st := 'non_sitting_day';
    END IF;
  END IF;

  IF st = 'ok' THEN
    SELECT a.amount_cents INTO alloc
    FROM public.voucher_allocations a
    WHERE a.holder_id = h.id AND a.for_date = public.cafe1_court_today();
    IF alloc IS NULL THEN alloc := h.daily_amount_cents; END IF;
  END IF;

  SELECT COALESCE(SUM(r.amount_cents), 0)::integer INTO used
  FROM public.voucher_redemptions r
  WHERE r.holder_id = h.id AND r.for_date = public.cafe1_court_today();

  SELECT EXISTS (
    SELECT 1 FROM public.juror_daily_presence p
    WHERE p.holder_id = h.id AND p.for_date = public.cafe1_court_today()
  ) INTO present_today;

  RETURN QUERY SELECT
    h.id, h.name, h.code, COALESCE(alloc, 0), COALESCE(used, 0),
    GREATEST(COALESCE(alloc, 0) - COALESCE(used, 0), 0),
    h.valid_from, h.valid_until, public.cafe1_is_juror_daily_participant(h.id,public.cafe1_court_today()),
    h.jury_room, h.attendance_required, present_today, st;
END $$;

-- Allow already-participating jurors to receive the food-only discount on
-- further purchases once their full daily voucher amount has been used.
CREATE OR REPLACE FUNCTION public.reserve_juror_voucher(
  _code text,
  _pin text,
  _amount_cents integer,
  _reservation_token uuid,
  _channel text DEFAULT 'online'
)
RETURNS TABLE(
  holder_id uuid,
  holder_name text,
  voucher_code text,
  reserved_cents integer,
  reservation_token uuid
)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  verified record;
  alloc public.voucher_allocations%ROWTYPE;
  used integer;
  take integer;
  redemption public.voucher_redemptions%ROWTYPE;
BEGIN
  IF _reservation_token IS NULL OR _amount_cents < 1 OR _amount_cents > 1000000 THEN
    RAISE EXCEPTION 'Invalid voucher reservation';
  END IF;
  IF _channel NOT IN ('online', 'counter') THEN RAISE EXCEPTION 'Invalid voucher channel'; END IF;

  SELECT r.* INTO redemption
  FROM public.voucher_redemptions r
  WHERE r.reservation_token = _reservation_token;
  IF FOUND THEN
    RETURN QUERY SELECT h.id, h.name, h.code, redemption.amount_cents, redemption.reservation_token
    FROM public.voucher_holders h WHERE h.id = redemption.holder_id;
    RETURN;
  END IF;

  SELECT * INTO verified
  FROM public.verify_juror_voucher_credentials(_code, _pin)
  LIMIT 1;
  IF NOT FOUND OR verified.status <> 'ok' THEN
    RAISE EXCEPTION 'Voucher code or PIN is invalid, locked or unavailable today';
  END IF;
  IF _channel = 'online' AND verified.attendance_required AND NOT verified.attendance_verified THEN
    RAISE EXCEPTION 'Confirm attendance with today''s jury-room QR before ordering online';
  END IF;

  SELECT * INTO alloc FROM public.voucher_allocations
  WHERE holder_id = verified.holder_id AND for_date = public.cafe1_court_today()
  FOR UPDATE;
  IF NOT FOUND THEN
    INSERT INTO public.voucher_allocations (holder_id, for_date, amount_cents, notes)
    VALUES (verified.holder_id, public.cafe1_court_today(), verified.allocated_cents, 'auto daily allowance')
    RETURNING * INTO alloc;
  END IF;

  SELECT COALESCE(SUM(r.amount_cents), 0)::integer INTO used
  FROM public.voucher_redemptions r
  WHERE r.holder_id = verified.holder_id AND r.for_date = public.cafe1_court_today();
  take := LEAST(GREATEST(_amount_cents, 0), GREATEST(alloc.amount_cents - used, 0));

  -- Additional purchases retain the non-beverage discount after the daily
  -- allowance has been fully used, but only by an already participating juror.
  IF take <= 0 THEN
    IF NOT public.cafe1_is_juror_daily_participant(
      verified.holder_id, public.cafe1_court_today()
    ) THEN RAISE EXCEPTION 'No voucher allowance remains today'; END IF;
    RETURN QUERY SELECT verified.holder_id, verified.holder_name,
      verified.code, 0, _reservation_token;
    RETURN;
  END IF;

  INSERT INTO public.voucher_redemptions (
    holder_id, allocation_id, order_id, for_date, amount_cents, reservation_token
  ) VALUES (
    verified.holder_id, alloc.id, NULL, public.cafe1_court_today(), take, _reservation_token
  ) RETURNING * INTO redemption;

  INSERT INTO public.voucher_events (holder_id, code, event, amount_cents, detail)
  VALUES (verified.holder_id, verified.code, 'reserve', take, _channel || ' checkout');

  RETURN QUERY SELECT
    verified.holder_id, verified.holder_name, verified.code, take, _reservation_token;
END $$;

REVOKE ALL ON FUNCTION public.verify_juror_voucher_credentials(text,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.verify_juror_voucher_credentials(text,text)
  TO service_role;
REVOKE ALL ON FUNCTION public.reserve_juror_voucher(text,text,integer,uuid,text)
  FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reserve_juror_voucher(text,text,integer,uuid,text)
  TO service_role;
