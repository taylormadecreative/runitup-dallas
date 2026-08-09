begin;
alter table public.runs
  add column if not exists goal_miles numeric,
  add column if not exists goal_hit boolean;
drop function public.save_run_with_checkin(timestamp with time zone, timestamp with time zone, integer, numeric, integer, jsonb, text);
CREATE OR REPLACE FUNCTION public.save_run_with_checkin(p_started_at timestamp with time zone, p_ended_at timestamp with time zone, p_duration_seconds integer, p_distance_miles numeric, p_pace_sec integer, p_points jsonb, p_event_type text, p_goal_miles numeric DEFAULT NULL, p_goal_hit boolean DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$ DECLARE v_uid UUID := auth.uid(); v_today DATE := (p_ended_at AT TIME ZONE 'America/Chicago')::date; v_existing UUID; v_run UUID; v_ci UUID; BEGIN IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF; IF p_distance_miles < 0 OR p_duration_seconds < 0 THEN RAISE EXCEPTION 'Invalid run data'; END IF; SELECT id INTO v_existing FROM public.check_ins WHERE user_id = v_uid AND event_type = p_event_type AND checked_in_at::date = v_today LIMIT 1; IF v_existing IS NULL THEN INSERT INTO public.check_ins (user_id, event_type, miles, checked_in_at) VALUES (v_uid, p_event_type, p_distance_miles, p_ended_at) RETURNING id INTO v_ci; ELSE UPDATE public.check_ins SET miles = COALESCE(miles, 0) + p_distance_miles WHERE id = v_existing RETURNING id INTO v_ci; END IF; INSERT INTO public.runs (user_id, check_in_id, started_at, ended_at, duration_seconds, distance_miles, avg_pace_sec_per_mile, route_points, goal_miles, goal_hit) VALUES (v_uid, v_ci, p_started_at, p_ended_at, p_duration_seconds, p_distance_miles, p_pace_sec, p_points, p_goal_miles, p_goal_hit) RETURNING id INTO v_run; RETURN jsonb_build_object('run_id', v_run, 'check_in_id', v_ci); END; $function$;
grant execute on function public.save_run_with_checkin(timestamp with time zone, timestamp with time zone, integer, numeric, integer, jsonb, text, numeric, boolean) to authenticated, service_role;
commit;

-- applied 2026-08-09 via Management API; explicit anon EXECUTE revoked afterward to match the 7/11 hardening state
revoke execute on function public.save_run_with_checkin(timestamp with time zone, timestamp with time zone, integer, numeric, integer, jsonb, text, numeric, boolean) from anon;
