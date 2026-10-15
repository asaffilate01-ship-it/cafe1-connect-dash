begin;

select plan(24);

select has_table('public', 'juror_daily_presence', 'daily juror presence table exists');
select has_table('public', 'juror_attendance_consumptions', 'per-voucher QR consumption table exists');

select has_column('public', 'voucher_holders', 'pin_hash', 'voucher PIN is stored as a hash');
select has_column('public', 'voucher_holders', 'failed_pin_attempts', 'per-code failures are tracked');
select has_column('public', 'voucher_holders', 'pin_locked_until', 'per-code lockout is tracked');
select has_column('public', 'voucher_holders', 'attendance_required', 'online attendance control exists');
select has_column('public', 'voucher_redemptions', 'reservation_token', 'concurrent checkout reservations are isolated');

select has_function('public', 'cafe1_issue_juror_batch', 'secure batch issuance exists');
select has_function('public', 'verify_juror_voucher_credentials', 'code and PIN verification exists');
select has_function('public', 'opt_in_voucher_secure', 'secure opt-in exists');
select has_function('public', 'reserve_juror_voucher', 'tokenised voucher reservation exists');
select has_function('public', 'attach_juror_voucher_reservation', 'reservation attachment exists');
select has_function('public', 'release_juror_voucher_reservation', 'isolated reservation release exists');
select has_function('public', 'prepare_counter_order_secure', 'PIN-protected POS checkout exists');
select has_function('public', 'cafe1_manage_juror_voucher', 'manager lifecycle control exists');
select has_function('public', 'cafe1_set_juror_daily_allowance', 'manager long-day uplift exists');
select has_function('public', 'cafe1_consume_juror_challenge_v2', 'rotating room verification exists');
select has_function('public', 'get_juror_claim_rows', 'paid-order claim report exists');

select ok(
  not has_function_privilege('anon', 'public.verify_juror_voucher_credentials(text,text)', 'EXECUTE'),
  'anonymous database clients cannot verify PINs directly'
);
-- The insecure legacy function is intentionally dropped. Checking permissions by
-- name raises SQLSTATE 42883 when absent; assert that it is absent instead.
select ok(
  to_regprocedure('public.prepare_counter_order(uuid,uuid,text,text,text,text,text,text,text,jsonb)') is null,
  'legacy code-only POS RPC is absent, not merely hidden from staff clients'
);
select ok(
  exists(
    select 1
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public'
      and p.proname='prepare_counter_order_secure'
      and has_function_privilege('authenticated',p.oid,'EXECUTE')
  ),
  'authenticated till operators can call the PIN-protected RPC'
);
select ok(
  not has_table_privilege('authenticated', 'public.voucher_holders', 'INSERT'),
  'staff cannot issue voucher rows directly'
);
select ok(
  not has_table_privilege('authenticated', 'public.voucher_allocations', 'UPDATE'),
  'staff cannot increase a daily allocation directly'
);
select ok(
  position('payment_status' in pg_get_functiondef('public.get_juror_claim_rows(date,date)'::regprocedure)) > 0,
  'HMCTS claim rows are filtered by order payment state'
);

select * from finish();
rollback;

