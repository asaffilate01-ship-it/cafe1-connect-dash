INSERT INTO auth.users(id) VALUES('40000000-0000-4000-8000-000000000001'),('40000000-0000-4000-8000-000000000002'),('40000000-0000-4000-8000-000000000003');
INSERT INTO public.profiles(id,email,full_name) VALUES('40000000-0000-4000-8000-000000000001','manager@example.test','Manager'),('40000000-0000-4000-8000-000000000002','staff@example.test','Staff'),('40000000-0000-4000-8000-000000000003','other@example.test','Other') ON CONFLICT(id) DO UPDATE SET email=EXCLUDED.email,full_name=EXCLUDED.full_name;
INSERT INTO public.user_roles(user_id,role) VALUES('40000000-0000-4000-8000-000000000001','admin'),('40000000-0000-4000-8000-000000000002','staff'),('40000000-0000-4000-8000-000000000003','staff');
INSERT INTO public.sites(id,code,name,legal_name,trading_name) VALUES('50000000-0000-4000-8000-000000000001','ATTEND_TEST','Test','Test','Test');
SELECT set_config('request.jwt.claims','{"aal":"aal2"}',true);
DO $$
DECLARE sid uuid:='50000000-0000-4000-8000-000000000001'; manager_id uuid:='40000000-0000-4000-8000-000000000001'; staff uuid:='40000000-0000-4000-8000-000000000002';
 device uuid:='60000000-0000-4000-8000-000000000001'; boundary jsonb:='[{"lat":51.75,"lng":-0.335},{"lat":51.75,"lng":-0.334},{"lat":51.751,"lng":-0.334},{"lat":51.751,"lng":-0.335}]';
 version uuid; sample jsonb; response jsonb; shift uuid; k integer; t text; privilege text; distance float; blocked boolean;
BEGIN
 -- Check all four sides and rounded corners in metres, not a single centre radius.
 FOR k IN 0..3 LOOP
  distance:=CASE k
   WHEN 0 THEN public.cafe1_attendance_distance(boundary,51.751+4.0/111320,-0.3345)
   WHEN 1 THEN public.cafe1_attendance_distance(boundary,51.75-4.0/111320,-0.3345)
   WHEN 2 THEN public.cafe1_attendance_distance(boundary,51.7505,-0.334+4.0/(111320*cos(radians(51.7505))))
   ELSE public.cafe1_attendance_distance(boundary,51.7505,-0.335-4.0/(111320*cos(radians(51.7505)))) END;
  IF abs(distance-4)>0.01 THEN RAISE EXCEPTION 'Side % buffer distance wrong: %',k,distance; END IF;
 END LOOP;
 distance:=public.cafe1_attendance_distance(boundary,51.751+4.0/111320,-0.334+4.0/(111320*cos(radians(51.7505))));
 IF abs(distance-sqrt(32))>0.01 THEN RAISE EXCEPTION 'Corner buffer is not radial'; END IF;
 -- Concave footprint: an internal courtyard must not become part of a bounding rectangle.
 IF public.cafe1_attendance_distance('[{"lat":51.75,"lng":-0.335},{"lat":51.75,"lng":-0.334},{"lat":51.7504,"lng":-0.334},{"lat":51.7504,"lng":-0.3346},{"lat":51.751,"lng":-0.3346},{"lat":51.751,"lng":-0.335}]',51.7508,-0.3342)<=5 THEN RAISE EXCEPTION 'Concave courtyard included'; END IF;
 PERFORM set_config('request.jwt.claim.sub',manager_id::text,true);
 PERFORM public.cafe1_attendance('boundary',jsonb_build_object('site_id',sid,'boundary',boundary,'verified_note','Synthetic test only, never field acceptance','enabled',true));
 SELECT c.version INTO version FROM public.attendance_sites c WHERE site_id=sid;
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 PERFORM public.cafe1_attendance('register',jsonb_build_object('site_id',sid,'device_id',device,'consent',true));
 PERFORM set_config('request.jwt.claim.sub',manager_id::text,true);
 PERFORM public.cafe1_attendance('device',jsonb_build_object('site_id',sid,'device_id',device,'approved',true));
 PERFORM set_config('request.jwt.claim.sub',staff::text,true);
 sample:=jsonb_build_object('site_id',sid,'device_id',device,'boundary_version',version,'id',gen_random_uuid(),'captured_at',now()-interval '290 seconds','lat',51.7501,'lng',-0.3349,'accuracy',3);
 response:=public.cafe1_attendance('sample',sample);
 -- Movement across the full indoor footprint maintains the arrival candidate.
 response:=public.cafe1_attendance('sample',sample||jsonb_build_object('id',gen_random_uuid(),'captured_at',now()-interval '260 seconds','lat',51.7509,'lng',-0.3341));
 response:=public.cafe1_attendance('sample',sample||jsonb_build_object('id',gen_random_uuid(),'captured_at',now()-interval '230 seconds','lat',51.7505));
 IF response->>'status'<>'clocked_in' THEN RAISE EXCEPTION 'Indoor movement interrupted arrival'; END IF;
 SELECT id INTO shift FROM public.staff_time_entries WHERE staff_id=staff AND clocked_out_at IS NULL;
 -- A short departure followed by unreliable GPS must not close a shift.
 response:=public.cafe1_attendance('sample',sample||jsonb_build_object('id',gen_random_uuid(),'captured_at',now()-interval '200 seconds','lat',51.752));
 response:=public.cafe1_attendance('sample',sample||jsonb_build_object('id',gen_random_uuid(),'captured_at',now()-interval '170 seconds','lat',51.752,'accuracy',10.01));
 IF response->>'classification'<>'uncertain' THEN RAISE EXCEPTION 'Accuracy threshold failed'; END IF;
 response:=public.cafe1_attendance('sample',sample||jsonb_build_object('id',gen_random_uuid(),'captured_at',now()-interval '140 seconds','lat',51.751+4.0/111320,'accuracy',3));
 IF response->>'classification'<>'uncertain' THEN RAISE EXCEPTION 'Boundary uncertainty failed'; END IF;
 response:=public.cafe1_attendance('sample',sample||jsonb_build_object('id',gen_random_uuid(),'captured_at',now()-interval '110 seconds','mocked',true));
 IF response->>'classification'<>'uncertain' THEN RAISE EXCEPTION 'Mocked GPS accepted'; END IF;
 response:=public.cafe1_attendance('sample',sample||jsonb_build_object('id',gen_random_uuid(),'captured_at',now(),'lat',51.752));
 IF NOT EXISTS(SELECT 1 FROM public.staff_time_entries WHERE id=shift AND clocked_out_at IS NULL) THEN RAISE EXCEPTION 'Missing departure evidence closed shift'; END IF;
 IF (SELECT candidate_at FROM public.attendance_state WHERE staff_id=staff AND site_id=sid)<>now() THEN RAISE EXCEPTION 'Evidence gap did not reset dwell'; END IF;
 -- Missed departure remains open until an audited manager correction; open shifts cannot be paid.
 PERFORM set_config('request.jwt.claim.sub',manager_id::text,true);
 blocked:=false; BEGIN PERFORM public.cafe1_attendance('approve',jsonb_build_object('site_id',sid,'entry_id',shift)); EXCEPTION WHEN OTHERS THEN blocked:=true; END;
 IF NOT blocked THEN RAISE EXCEPTION 'Open shift approved'; END IF;
 PERFORM public.cafe1_attendance('correct',jsonb_build_object('site_id',sid,'entry_id',shift,'clocked_in_at','2026-10-25T00:30:00Z','clocked_out_at','2026-10-25T02:30:00Z','break_minutes',15,'reason','Manual timesheet confirms missed departure'));
 PERFORM public.cafe1_attendance('rate',jsonb_build_object('site_id',sid,'staff_id',staff,'effective_from','2026-10-24','hourly_cents',1250));
 PERFORM public.cafe1_attendance('rate',jsonb_build_object('site_id',sid,'staff_id',staff,'effective_from','2026-10-26','hourly_cents',1500));
 PERFORM public.cafe1_attendance('approve',jsonb_build_object('site_id',sid,'entry_id',shift));
 IF (SELECT approved_pay_cents FROM public.staff_time_entries WHERE id=shift)<>2188 THEN RAISE EXCEPTION 'DST elapsed-time, break, rate or penny rounding failed'; END IF;
 PERFORM public.cafe1_attendance('correct',jsonb_build_object('site_id',sid,'entry_id',shift,'clocked_in_at','2026-10-25T00:30:00Z','clocked_out_at','2026-10-25T02:30:00Z','break_minutes',30,'reason','Correct unpaid break from manual sheet'));
 IF EXISTS(SELECT 1 FROM public.staff_time_entries WHERE id=shift AND (approved_at IS NOT NULL OR approved_pay_cents IS NOT NULL)) THEN RAISE EXCEPTION 'Correction retained approval'; END IF;
 -- Test RLS enablement AND direct privilege revocation for all private evidence tables.
 FOREACH t IN ARRAY ARRAY['attendance_sites','attendance_devices','attendance_rates','attendance_samples','attendance_state'] LOOP
  IF NOT (SELECT relrowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass) THEN RAISE EXCEPTION 'RLS disabled: %',t; END IF;
  FOREACH privilege IN ARRAY ARRAY['SELECT','INSERT','UPDATE','DELETE','TRUNCATE'] LOOP
   IF has_table_privilege('authenticated','public.'||t,privilege) OR has_table_privilege('anon','public.'||t,privilege) THEN RAISE EXCEPTION 'Direct access: % %',t,privilege; END IF;
  END LOOP;
 END LOOP;
END $$;
-- Exercise the RPC as the actual authenticated role, not just as the database owner.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','40000000-0000-4000-8000-000000000003',true);
DO $$ BEGIN
 IF jsonb_array_length(public.cafe1_attendance('dashboard','{"site_id":"50000000-0000-4000-8000-000000000001","from":"2026-10-01","to":"2026-10-29"}')->'entries')<>0 THEN RAISE EXCEPTION 'Cross-account payroll exposed'; END IF;
END $$;
RESET ROLE;
