-- The all-dates attention panel uses the caller's table SELECT policy, not a definer RPC.
begin;
select plan(1);
INSERT INTO auth.users(id) VALUES
 ('70000000-0000-4000-8000-000000000001'),
 ('70000000-0000-4000-8000-000000000002'),
 ('70000000-0000-4000-8000-000000000003');
INSERT INTO public.user_roles(user_id,role) VALUES
 ('70000000-0000-4000-8000-000000000001','admin'),
 ('70000000-0000-4000-8000-000000000002','staff'),
 ('70000000-0000-4000-8000-000000000003','driver');
INSERT INTO public.sites(id,code,name,legal_name,trading_name) VALUES
 ('80000000-0000-4000-8000-000000000001','OPEN_TEST_A','A','A','A'),
 ('80000000-0000-4000-8000-000000000002','OPEN_TEST_B','B','B','B');
INSERT INTO public.staff_time_entries(site_id,staff_id,clocked_in_at,clocked_out_at) VALUES
 ('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',now()-interval '400 days',null),
 ('80000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000003',now()-interval '2 days',null),
 ('80000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003',now()-interval '4 days',now()-interval '3 days');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000002',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.staff_time_entries WHERE site_id='80000000-0000-4000-8000-000000000001' AND clocked_out_at IS NULL)<>1 THEN RAISE EXCEPTION 'Old own open shift missing'; END IF;
 IF EXISTS(SELECT 1 FROM public.staff_time_entries WHERE staff_id='70000000-0000-4000-8000-000000000003') THEN RAISE EXCEPTION 'Other staff records exposed'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.staff_time_entries WHERE site_id='80000000-0000-4000-8000-000000000001' AND clocked_out_at IS NULL) THEN RAISE EXCEPTION 'Closed or other staff shift included'; END IF;
 IF (SELECT count(*) FROM public.staff_time_entries WHERE site_id='80000000-0000-4000-8000-000000000002' AND clocked_out_at IS NULL)<>1 THEN RAISE EXCEPTION 'Driver own open shift missing'; END IF;
END $$;
SELECT set_config('request.jwt.claim.sub','70000000-0000-4000-8000-000000000001',true);
DO $$ BEGIN
 IF (SELECT count(*) FROM public.staff_time_entries WHERE site_id IN ('80000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002') AND clocked_out_at IS NULL)<>2 THEN RAISE EXCEPTION 'Manager cannot review open shifts'; END IF;
END $$;
RESET ROLE;
select pass('All-date open shifts respect staff/driver isolation, manager access and site/closed filters');
select * from finish();
rollback;
