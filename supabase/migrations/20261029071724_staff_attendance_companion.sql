-- Attendance is opt-in per device and disabled until a manager verifies the boundary.
CREATE TABLE public.attendance_sites (
 site_id uuid PRIMARY KEY REFERENCES public.sites(id), boundary jsonb NOT NULL,
 version uuid NOT NULL DEFAULT gen_random_uuid(), enabled boolean NOT NULL DEFAULT false,
 buffer_metres integer NOT NULL DEFAULT 5 CHECK(buffer_metres=5),
 verified_note text NOT NULL, updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.attendance_devices (
 id uuid PRIMARY KEY, staff_id uuid NOT NULL REFERENCES auth.users(id),
 site_id uuid NOT NULL REFERENCES public.sites(id), label text NOT NULL,
 approved boolean NOT NULL DEFAULT false, consent_at timestamptz NOT NULL DEFAULT now(),
 last_seen_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX attendance_one_approved_device ON public.attendance_devices(staff_id) WHERE approved;
CREATE TABLE public.attendance_rates (
 staff_id uuid NOT NULL REFERENCES auth.users(id), site_id uuid NOT NULL REFERENCES public.sites(id),
 effective_from date NOT NULL, hourly_cents integer NOT NULL CHECK(hourly_cents BETWEEN 0 AND 100000),
 PRIMARY KEY(staff_id,site_id,effective_from)
);
CREATE TABLE public.attendance_samples (
 id uuid PRIMARY KEY, device_id uuid NOT NULL REFERENCES public.attendance_devices(id),
 staff_id uuid NOT NULL REFERENCES auth.users(id), site_id uuid NOT NULL REFERENCES public.sites(id),
 captured_at timestamptz NOT NULL, received_at timestamptz NOT NULL DEFAULT now(),
 classification text NOT NULL, outcome text NOT NULL, boundary_version uuid NOT NULL,
 accuracy_metres numeric NOT NULL
);
CREATE INDEX attendance_samples_staff_time ON public.attendance_samples(staff_id, captured_at DESC);
CREATE TABLE public.attendance_state (
 staff_id uuid NOT NULL REFERENCES auth.users(id), site_id uuid NOT NULL REFERENCES public.sites(id),
 last_at timestamptz, candidate text, candidate_at timestamptz, version uuid,
 PRIMARY KEY(staff_id,site_id)
);
ALTER TABLE public.staff_time_entries ADD COLUMN IF NOT EXISTS approved_pay_cents integer;

-- No direct client writes; all mutations below check the actor and record an audit event.
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['attendance_sites','attendance_devices','attendance_rates','attendance_samples','attendance_state'] LOOP
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM anon, authenticated',t);
 END LOOP;
END $$;

-- A local metric projection is sufficient for a small UK building, not regional geofences.
CREATE FUNCTION public.cafe1_attendance_distance(_boundary jsonb, _lat double precision, _lng double precision)
RETURNS double precision LANGUAGE plpgsql IMMUTABLE SET search_path = public AS $$
DECLARE shape polygon; scale double precision; centre_lat double precision; v jsonb; pts text; vertices point[]; i integer; j integer; n integer; edge_distance double precision; pos point; BEGIN
 IF jsonb_typeof(_boundary)<>'array' OR jsonb_array_length(_boundary) NOT BETWEEN 3 AND 60 THEN RAISE EXCEPTION 'Draw 3 to 60 boundary corners'; END IF;
 SELECT avg((p->>'lat')::double precision) INTO centre_lat FROM jsonb_array_elements(_boundary) p;
 scale:=111320*cos(radians(centre_lat));
 FOR v IN SELECT * FROM jsonb_array_elements(_boundary) LOOP
  IF NOT ((v->>'lat')::numeric BETWEEN 49 AND 61 AND (v->>'lng')::numeric BETWEEN -9 AND 3) OR v->>'lat' IS NULL OR v->>'lng' IS NULL THEN RAISE EXCEPTION 'Boundary must use valid UK coordinates'; END IF;
 END LOOP;
 IF (SELECT max((p->>'lat')::numeric)-min((p->>'lat')::numeric)>0.01 OR max((p->>'lng')::numeric)-min((p->>'lng')::numeric)>0.02 FROM jsonb_array_elements(_boundary) p) THEN RAISE EXCEPTION 'Boundary is too large'; END IF;
 SELECT string_agg(format('(%s,%s)',(p->>'lng')::double precision*scale,(p->>'lat')::double precision*111320),',') INTO pts FROM jsonb_array_elements(_boundary) p;
 shape:=('('||pts||')')::polygon;
 IF area(path(shape))<10 THEN RAISE EXCEPTION 'Boundary has no usable area'; END IF;
 SELECT array_agg(point((p->>'lng')::double precision*scale,(p->>'lat')::double precision*111320)) INTO vertices FROM jsonb_array_elements(_boundary) p;
 n:=array_length(vertices,1);
 FOR i IN 1..n LOOP
  IF vertices[i] ~= vertices[i%n+1] THEN RAISE EXCEPTION 'Duplicate adjacent boundary corners'; END IF;
  FOR j IN i+1..n LOOP
   IF j<>i+1 AND NOT(i=1 AND j=n) AND lseg(vertices[i],vertices[i%n+1]) ?# lseg(vertices[j],vertices[j%n+1]) THEN RAISE EXCEPTION 'Boundary edges cross'; END IF;
  END LOOP;
 END LOOP;
 pos:=point(_lng*scale,_lat*111320);
 SELECT min(pos <-> lseg(vertices[k],vertices[k%n+1])) INTO edge_distance FROM generate_series(1,n) k;
 RETURN CASE WHEN pos <@ shape THEN -edge_distance ELSE edge_distance END;
END $$;
REVOKE ALL ON FUNCTION public.cafe1_attendance_distance(jsonb,double precision,double precision) FROM PUBLIC,anon,authenticated;

CREATE FUNCTION public.cafe1_attendance(_action text, _data jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public,pg_temp AS $$
DECLARE actor uuid:=auth.uid(); manager boolean; sid uuid; did uuid; target uuid; cfg public.attendance_sites%ROWTYPE;
 dev public.attendance_devices%ROWTYPE; st public.attendance_state%ROWTYPE; entry public.staff_time_entries%ROWTYPE;
 captured timestamptz; acc numeric; distance double precision; classification text; result text:='observed';
 sample_id uuid; amount integer; from_day date; to_day date; rate integer; note text; started timestamptz; finished timestamptz;
BEGIN
 IF actor IS NULL THEN RAISE EXCEPTION 'Sign in required'; END IF;
 manager:=public.has_role(actor,'admin');
 IF NOT (manager OR public.has_role(actor,'staff') OR public.has_role(actor,'driver')) THEN RAISE EXCEPTION 'Registered staff only'; END IF;
 sid:=(_data->>'site_id')::uuid;
 IF NOT EXISTS(SELECT 1 FROM public.sites WHERE id=sid) THEN RAISE EXCEPTION 'Choose a valid site'; END IF;
 IF _action='register' THEN
  did:=(_data->>'device_id')::uuid;
  IF _data->>'consent' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Location acknowledgement required'; END IF;
  INSERT INTO public.attendance_devices(id,staff_id,site_id,label) VALUES(did,actor,sid,left(coalesce(_data->>'label','My phone'),80)) ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM public.attendance_devices WHERE id=did AND staff_id=actor AND site_id=sid) THEN RAISE EXCEPTION 'Device belongs to another account or site'; END IF;
  RETURN jsonb_build_object('status','pending_or_registered');
 ELSIF _action='sample' THEN
  did:=(_data->>'device_id')::uuid; sample_id:=(_data->>'id')::uuid;
  SELECT * INTO dev FROM public.attendance_devices WHERE id=did AND staff_id=actor AND site_id=sid FOR UPDATE;
  IF dev.id IS NULL OR NOT dev.approved THEN RAISE EXCEPTION 'Device approval required'; END IF;
  SELECT * INTO cfg FROM public.attendance_sites WHERE site_id=sid;
  IF cfg.site_id IS NULL OR NOT cfg.enabled THEN RAISE EXCEPTION 'Verified boundary not enabled'; END IF;
  IF (_data->>'boundary_version')::uuid IS DISTINCT FROM cfg.version THEN RAISE EXCEPTION 'Boundary changed; refresh configuration'; END IF;
  IF EXISTS(SELECT 1 FROM public.attendance_samples WHERE id=sample_id AND staff_id=actor) THEN RETURN jsonb_build_object('status','duplicate'); END IF;
  captured:=(_data->>'captured_at')::timestamptz; acc:=(_data->>'accuracy')::numeric;
  IF captured IS NULL OR captured>now()+interval '1 minute' OR captured<now()-interval '7 days' OR acc IS NULL OR NOT (acc BETWEEN 0 AND 10000) OR NOT ((_data->>'lat')::numeric BETWEEN -90 AND 90) OR NOT ((_data->>'lng')::numeric BETWEEN -180 AND 180) OR _data->>'lat' IS NULL OR _data->>'lng' IS NULL THEN RAISE EXCEPTION 'Invalid location sample'; END IF;
  distance:=public.cafe1_attendance_distance(cfg.boundary,(_data->>'lat')::double precision,(_data->>'lng')::double precision);
  -- Reported accuracy is a confidence radius. Ambiguous samples never change clock status.
  classification:=CASE WHEN acc>10 OR coalesce((_data->>'mocked')::boolean,false) THEN 'uncertain' WHEN distance+acc<=5 THEN 'inside' WHEN distance-acc>5 THEN 'outside' ELSE 'uncertain' END;
  INSERT INTO public.attendance_state(staff_id,site_id) VALUES(actor,sid) ON CONFLICT DO NOTHING;
  SELECT * INTO st FROM public.attendance_state WHERE staff_id=actor AND site_id=sid FOR UPDATE;
  IF captured<=st.last_at THEN result:='out_of_order_review';
  ELSIF captured<now()-interval '5 minutes' THEN result:='offline_review';
  ELSE
   IF st.version IS DISTINCT FROM cfg.version OR captured-st.last_at>interval '90 seconds' OR classification='uncertain' OR st.candidate IS DISTINCT FROM classification THEN
    st.candidate:=CASE WHEN classification='uncertain' THEN NULL ELSE classification END; st.candidate_at:=captured;
   END IF;
   SELECT * INTO entry FROM public.staff_time_entries WHERE staff_id=actor AND clocked_out_at IS NULL FOR UPDATE;
   IF classification='inside' AND captured-st.candidate_at>=interval '60 seconds' AND entry.id IS NULL THEN
    INSERT INTO public.staff_time_entries(site_id,staff_id,clocked_in_at,note) VALUES(sid,actor,st.candidate_at,'Automatic arrival; pending manager approval') RETURNING * INTO entry; result:='clocked_in';
   ELSIF classification='outside' AND captured-st.candidate_at>=interval '180 seconds' AND entry.id IS NOT NULL AND entry.site_id=sid THEN
    IF st.candidate_at>entry.clocked_in_at AND st.candidate_at-entry.clocked_in_at<=interval '18 hours' THEN
     UPDATE public.staff_time_entries SET clocked_out_at=st.candidate_at,approved_at=NULL,approved_by=NULL,approved_pay_cents=NULL WHERE id=entry.id; result:='clocked_out';
    ELSE result:='shift_review'; END IF;
   END IF;
   UPDATE public.attendance_state SET last_at=captured,candidate=st.candidate,candidate_at=st.candidate_at,version=cfg.version WHERE staff_id=actor AND site_id=sid;
  END IF;
  INSERT INTO public.attendance_samples(id,device_id,staff_id,site_id,captured_at,classification,outcome,boundary_version,accuracy_metres) VALUES(sample_id,did,actor,sid,captured,classification,result,cfg.version,acc);
  UPDATE public.attendance_devices SET last_seen_at=now() WHERE id=did;
  IF result IN ('clocked_in','clocked_out') THEN INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,detail) VALUES(actor,'attendance.'||result,'staff_time_entry',entry.id,jsonb_build_object('sample_id',sample_id,'device_id',did)); END IF;
  RETURN jsonb_build_object('status',result,'classification',classification);
 ELSIF _action='dashboard' THEN
  from_day:=(_data->>'from')::date; to_day:=(_data->>'to')::date;
  IF from_day IS NULL OR to_day IS NULL OR to_day<from_day OR to_day-from_day>366 THEN RAISE EXCEPTION 'Choose a period up to one year'; END IF;
  RETURN jsonb_build_object(
   'manager',manager,
   'config',(SELECT to_jsonb(c) FROM public.attendance_sites c WHERE c.site_id=sid),
   'devices',coalesce((SELECT jsonb_agg(to_jsonb(d) ORDER BY d.created_at) FROM public.attendance_devices d WHERE d.site_id=sid AND (manager OR d.staff_id=actor)),'[]'::jsonb),
   'staff',CASE WHEN manager THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,'name',coalesce(nullif(p.full_name,''),p.email))) FROM public.profiles p WHERE EXISTS(SELECT 1 FROM public.user_roles r WHERE r.user_id=p.id AND r.role::text IN ('admin','staff','driver'))),'[]'::jsonb) ELSE '[]'::jsonb END,
   'rates',coalesce((SELECT jsonb_agg(r) FROM public.attendance_rates r WHERE r.site_id=sid AND (manager OR r.staff_id=actor)),'[]'::jsonb),
   'entries',coalesce((SELECT jsonb_agg(e ORDER BY e.clocked_in_at DESC) FROM (
    SELECT t.*,coalesce(nullif(p.full_name,''),p.email) AS staff_name,
    CASE WHEN t.clocked_out_at IS NULL THEN NULL ELSE greatest(0,round(extract(epoch FROM(t.clocked_out_at-t.clocked_in_at))/60)::integer-t.break_minutes) END AS paid_minutes,
    CASE WHEN t.clocked_out_at IS NULL OR r.hourly_cents IS NULL THEN NULL ELSE round(greatest(0,extract(epoch FROM(t.clocked_out_at-t.clocked_in_at))/60-t.break_minutes)*r.hourly_cents/60)::integer END AS estimated_pay_cents
    FROM public.staff_time_entries t LEFT JOIN public.profiles p ON p.id=t.staff_id
    LEFT JOIN LATERAL(SELECT hourly_cents FROM public.attendance_rates WHERE staff_id=t.staff_id AND site_id=t.site_id AND effective_from<=(t.clocked_in_at AT TIME ZONE 'Europe/London')::date ORDER BY effective_from DESC LIMIT 1) r ON true
    WHERE t.site_id=sid AND (manager OR t.staff_id=actor) AND (t.clocked_in_at AT TIME ZONE 'Europe/London')::date BETWEEN from_day AND to_day
   ) e),'[]'::jsonb),
   'exceptions',coalesce((SELECT jsonb_agg(e) FROM(SELECT * FROM public.attendance_samples WHERE site_id=sid AND (manager OR staff_id=actor) AND outcome IN ('offline_review','out_of_order_review','shift_review') AND (captured_at AT TIME ZONE 'Europe/London')::date BETWEEN from_day AND to_day ORDER BY captured_at DESC LIMIT 500)e),'[]'::jsonb)
  );
 END IF;
 IF NOT manager THEN RAISE EXCEPTION 'Manager approval required'; END IF;
 IF _action='boundary' THEN
  PERFORM public.cafe1_attendance_distance(_data->'boundary',51,0);
  note:=trim(_data->>'verified_note');
  IF length(coalesce(note,''))<10 THEN RAISE EXCEPTION 'Record the boundary and walking-test verification note'; END IF;
  INSERT INTO public.attendance_sites(site_id,boundary,verified_note,enabled) VALUES(sid,_data->'boundary',left(note,1000),coalesce((_data->>'enabled')::boolean,false)) ON CONFLICT(site_id) DO UPDATE SET boundary=EXCLUDED.boundary,verified_note=EXCLUDED.verified_note,enabled=EXCLUDED.enabled,version=gen_random_uuid(),updated_at=now();
 ELSIF _action='device' THEN
  UPDATE public.attendance_devices SET approved=coalesce((_data->>'approved')::boolean,false) WHERE id=(_data->>'device_id')::uuid AND site_id=sid RETURNING staff_id INTO target;
  IF NOT FOUND THEN RAISE EXCEPTION 'Device not found'; END IF;
  DELETE FROM public.attendance_state WHERE staff_id=target AND site_id=sid;
 ELSIF _action='rate' THEN
  target:=(_data->>'staff_id')::uuid;
  IF NOT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id=target AND role::text IN ('admin','staff','driver')) THEN RAISE EXCEPTION 'Registered staff only'; END IF;
  INSERT INTO public.attendance_rates(staff_id,site_id,effective_from,hourly_cents) VALUES(target,sid,(_data->>'effective_from')::date,(_data->>'hourly_cents')::integer) ON CONFLICT(staff_id,site_id,effective_from) DO UPDATE SET hourly_cents=EXCLUDED.hourly_cents;
 ELSIF _action IN ('approve','correct') THEN
  SELECT * INTO entry FROM public.staff_time_entries WHERE id=(_data->>'entry_id')::uuid AND site_id=sid FOR UPDATE;
  IF entry.id IS NULL THEN RAISE EXCEPTION 'Shift not found'; END IF;
  IF _action='correct' THEN
   started:=(_data->>'clocked_in_at')::timestamptz; finished:=(_data->>'clocked_out_at')::timestamptz;
   IF started IS NULL OR finished IS NULL OR finished<=started OR finished-started>interval '18 hours' OR finished>now() OR length(trim(coalesce(_data->>'reason','')))<5 OR (_data->>'break_minutes')::integer NOT BETWEEN 0 AND floor(extract(epoch FROM(finished-started))/60) THEN RAISE EXCEPTION 'Enter valid shift times, breaks and correction reason'; END IF;
   IF EXISTS(SELECT 1 FROM public.staff_time_entries t WHERE t.staff_id=entry.staff_id AND t.id<>entry.id AND tstzrange(t.clocked_in_at,t.clocked_out_at,'[)') && tstzrange(started,finished,'[)')) THEN RAISE EXCEPTION 'Overlapping shifts need correction'; END IF;
   UPDATE public.staff_time_entries SET clocked_in_at=started,clocked_out_at=finished,break_minutes=(_data->>'break_minutes')::integer,approved_at=NULL,approved_by=NULL,approved_pay_cents=NULL WHERE id=entry.id;
  ELSE
   IF EXISTS(SELECT 1 FROM public.staff_time_entries t WHERE t.staff_id=entry.staff_id AND t.id<>entry.id AND tstzrange(t.clocked_in_at,t.clocked_out_at,'[)') && tstzrange(entry.clocked_in_at,entry.clocked_out_at,'[)')) THEN RAISE EXCEPTION 'Overlapping shifts need correction'; END IF;
   IF entry.clocked_out_at IS NULL OR entry.clocked_out_at<=entry.clocked_in_at OR entry.clocked_out_at-entry.clocked_in_at>interval '18 hours' OR entry.break_minutes>extract(epoch FROM(entry.clocked_out_at-entry.clocked_in_at))/60 THEN RAISE EXCEPTION 'Review shift times and breaks first'; END IF;
   SELECT hourly_cents INTO rate FROM public.attendance_rates WHERE staff_id=entry.staff_id AND site_id=sid AND effective_from<=(entry.clocked_in_at AT TIME ZONE 'Europe/London')::date ORDER BY effective_from DESC LIMIT 1;
   IF rate IS NULL THEN RAISE EXCEPTION 'Set an effective hourly rate first'; END IF;
   amount:=round(greatest(0,extract(epoch FROM(entry.clocked_out_at-entry.clocked_in_at))/60-entry.break_minutes)*rate/60)::integer;
   UPDATE public.staff_time_entries SET approved_at=now(),approved_by=actor,approved_pay_cents=amount WHERE id=entry.id;
  END IF;
 ELSE RAISE EXCEPTION 'Unknown action'; END IF;
 INSERT INTO public.audit_events(actor_id,action,entity_type,entity_id,detail) VALUES(actor,'attendance.'||_action,'site',sid,jsonb_build_object('request',_data,'previous_entry',to_jsonb(entry)));
 RETURN jsonb_build_object('status','saved');
END $$;
REVOKE ALL ON FUNCTION public.cafe1_attendance(text,jsonb) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.cafe1_attendance(text,jsonb) TO authenticated;
