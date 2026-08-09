begin;
alter table public.runs add column if not exists client_run_id uuid;
create unique index if not exists runs_user_client_run_id
  on public.runs (user_id, client_run_id) where client_run_id is not null;
drop function public.save_run_with_checkin(timestamp with time zone, timestamp with time zone, integer, numeric, integer, jsonb, text, numeric, boolean);
CREATE FUNCTION public.save_run_with_checkin(p_started_at timestamp with time zone, p_ended_at timestamp with time zone, p_duration_seconds integer, p_distance_miles numeric, p_pace_sec integer, p_points jsonb, p_event_type text, p_goal_miles numeric DEFAULT NULL, p_goal_hit boolean DEFAULT NULL, p_client_run_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_uid UUID := auth.uid(); v_today DATE := (p_ended_at AT TIME ZONE 'America/Chicago')::date; v_event public.event_type; v_existing UUID; v_run UUID; v_ci UUID; BEGIN IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF; IF p_distance_miles < 0 OR p_duration_seconds < 0 THEN RAISE EXCEPTION 'Invalid run data'; END IF; -- Idempotency: a retry (or a lost-response replay) of the same client run
 -- returns the already-saved row instead of double-counting anything.
 IF p_client_run_id IS NOT NULL THEN SELECT id, check_in_id INTO v_run, v_ci FROM public.runs WHERE user_id = v_uid AND client_run_id = p_client_run_id LIMIT 1; IF v_run IS NOT NULL THEN RETURN jsonb_build_object('run_id', v_run, 'check_in_id', v_ci); END IF; END IF; -- 'solo' (or any non-club label) = a run with no check-in attached
 IF p_event_type IS NOT NULL AND p_event_type = ANY (enum_range(NULL::public.event_type)::text[]) THEN v_event := p_event_type::public.event_type; END IF; IF v_event IS NOT NULL THEN SELECT id INTO v_existing FROM public.check_ins WHERE user_id = v_uid AND event_type = v_event AND checked_in_at::date = v_today LIMIT 1; IF v_existing IS NULL THEN INSERT INTO public.check_ins (user_id, event_type, miles, checked_in_at) VALUES (v_uid, v_event, p_distance_miles, p_ended_at) RETURNING id INTO v_ci; ELSE UPDATE public.check_ins SET miles = COALESCE(miles, 0) + p_distance_miles WHERE id = v_existing RETURNING id INTO v_ci; END IF; END IF; INSERT INTO public.runs (user_id, check_in_id, started_at, ended_at, duration_seconds, distance_miles, avg_pace_sec_per_mile, route_points, goal_miles, goal_hit, client_run_id) VALUES (v_uid, v_ci, p_started_at, p_ended_at, p_duration_seconds, p_distance_miles, p_pace_sec, p_points, p_goal_miles, p_goal_hit, p_client_run_id) RETURNING id INTO v_run; RETURN jsonb_build_object('run_id', v_run, 'check_in_id', v_ci); END; $function$;
grant execute on function public.save_run_with_checkin(timestamp with time zone, timestamp with time zone, integer, numeric, integer, jsonb, text, numeric, boolean, uuid) to authenticated, service_role;
revoke execute on function public.save_run_with_checkin(timestamp with time zone, timestamp with time zone, integer, numeric, integer, jsonb, text, numeric, boolean, uuid) from anon;
commit;
