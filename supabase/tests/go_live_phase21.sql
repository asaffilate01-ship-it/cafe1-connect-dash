begin;

select plan(18);

select has_column('public', 'business_settings', 'vat_registered', 'VAT status is explicit');
select has_column('public', 'business_settings', 'vat_number', 'future VAT number is supported');

select is(
  (select delivery_origin_postcode from public.business_settings limit 1),
  'AL1 3JU',
  'delivery origin is AL1 3JU'
);
select is(
  (select delivery_radius_m from public.business_settings limit 1),
  805,
  'delivery radius is half a mile'
);
select is(
  (select delivery_open_time::text from public.business_settings limit 1),
  '08:30:00',
  'delivery starts at 08:30'
);
select is(
  (select delivery_close_time::text from public.business_settings limit 1),
  '16:30:00',
  'delivery ends at 16:30'
);
select is(
  (select vat_registered from public.business_settings limit 1),
  false,
  'Cafe 1 is not VAT registered'
);

select is(
  (select count(*)::integer from public.business_hours
   where day_of_week between 1 and 5
     and open_time = '08:00'::time
     and close_time = '17:00'::time
     and closed = false),
  5,
  'all weekdays trade 08:00 to 17:00'
);
select is(
  (select count(*)::integer from public.business_hours
   where day_of_week in (0, 6) and closed = true),
  2,
  'weekends are closed'
);
select ok(
  exists(select 1 from public.bank_holidays where holiday_date = '2027-12-27'),
  'England and Wales substitute bank holidays are seeded'
);

select has_function('public', 'cafe1_activate_juror_ids', array['text', 'text[]', 'date', 'integer'],
  'fixed-term Juror ID activation exists');
select ok(
  position('end_date := _valid_from + (_weeks * 7) - 1' in
    pg_get_functiondef('public.cafe1_activate_juror_ids(text,text[],date,integer)'::regprocedure)) > 0,
  'Juror ID expiry is exactly 12 calendar weeks'
);
select ok(
  position('attendance_required = true' in
    pg_get_functiondef('public.cafe1_activate_juror_ids(text,text[],date,integer)'::regprocedure)) > 0,
  'Juror ID activation requires daily attendance proof'
);
select ok(
  position('pin_hash = NULL' in
    pg_get_functiondef('public.cafe1_activate_juror_ids(text,text[],date,integer)'::regprocedure)) > 0,
  'reused Juror IDs rotate their credentials'
);
select ok(
  position('WHERE upper(code) = normalised' in
    pg_get_functiondef('public.cafe1_activate_juror_ids(text,text[],date,integer)'::regprocedure)) > 0,
  'the normalized Juror ID is the voucher code'
);
select ok(
  position('is_court_working_day(CURRENT_DATE)' in
    pg_get_functiondef('public.verify_juror_voucher_credentials(text,text)'::regprocedure)) > 0,
  'voucher verification blocks weekends and configured bank holidays'
);
select ok(
  NOT has_function_privilege(
    'authenticated',
    'public.cafe1_issue_juror_batch(text,integer,date,integer)',
    'EXECUTE'
  ),
  'separate generated juror voucher codes cannot be issued'
);
select ok(
  position('aal2' in COALESCE((
    select qual from pg_policies
    where schemaname = 'public'
      and tablename = 'business_settings'
      and policyname = 'business_settings_manager_aal2_write'
  ), '')) > 0,
  'settings writes require a manager AAL2 policy'
);

select * from finish();
rollback;
