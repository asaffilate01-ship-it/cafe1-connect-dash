BEGIN;
SELECT plan(17);

SELECT has_function('public','cafe1_court_today',ARRAY[]::text[],
  'court-local calendar clock exists');
SELECT has_function('public','cafe1_is_juror_daily_participant',ARRAY['uuid','date'],
  'daily participation follows settled voucher redemptions');
SELECT has_function('public','cafe1_juror_daily_status_by_id',ARRAY['text'],
  'Juror ID-only read-only daily balance exists');
SELECT has_function('public','juror_opt_in_with_id',ARRAY['text','text'],
  'separate secure PIN setup exists');
SELECT has_function('public','get_juror_claim_rows',ARRAY['date','date'],
  'itemised weekly claim source exists');
SELECT has_function('public','cafe1_activate_juror_ids',ARRAY['text','text[]','date','integer'],
  '12-week Juror ID activation exists');

SELECT ok(
  NOT has_function_privilege('anon','public.cafe1_juror_daily_status_by_id(text)','EXECUTE'),
  'anon database clients cannot bypass throttled server balance endpoint');
SELECT ok(
  NOT has_function_privilege('authenticated','public.cafe1_juror_daily_status_by_id(text)','EXECUTE'),
  'authenticated public clients also cannot query private ID balances directly');
SELECT ok(
  has_function_privilege('service_role','public.cafe1_juror_daily_status_by_id(text)','EXECUTE'),
  'server service role may query pseudonymous daily balances');
SELECT ok(
  NOT has_function_privilege('anon','public.cafe1_is_juror_daily_participant(uuid,date)','EXECUTE'),
  'anonymous clients cannot enumerate daily participation');
SELECT ok(
  position('o.payment_status IN (' in pg_get_functiondef(
    'public.cafe1_is_juror_daily_participant(uuid,date)'::regprocedure)) > 0,
  'participation is tied to paid/on-account orders');
SELECT ok(
  position('refunded_cents' in pg_get_functiondef(
    'public.cafe1_is_juror_daily_participant(uuid,date)'::regprocedure)) > 0,
  'refunds exclude a day from the funded claim');
SELECT ok(
  position('opted_in_at=NULL' in replace(pg_get_functiondef(
    'public.juror_opt_in_with_id(text,text)'::regprocedure),' ','')) > 0,
  'issuing PIN does not permanently opt a juror in');
SELECT ok(
  position('batch_repeat' in pg_get_functiondef(
    'public.cafe1_activate_juror_ids(text,text[],date,integer)'::regprocedure)) > 0,
  'repeat weekly lists preserve an active juror PIN and expiry');
SELECT ok(
  position('public.cafe1_court_today()' in pg_get_functiondef(
    'public.verify_juror_voucher_credentials(text,text)'::regprocedure)) > 0,
  'PIN voucher verification uses St Albans local date');
SELECT ok(
  position('refunded_cents' in pg_get_functiondef(
    'public.get_juror_claim_rows(date,date)'::regprocedure)) > 0,
  'reimbursement excludes refunded orders');
SELECT ok(
  position('No voucher allowance remains today' in pg_get_functiondef(
    'public.reserve_juror_voucher(text,text,integer,uuid,text)'::regprocedure)) > 0,
  'voucher reserves enforce the daily funded allowance limit');

SELECT * FROM finish();
ROLLBACK;
