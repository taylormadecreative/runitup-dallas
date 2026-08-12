-- v1.6 run detail & history: weight for calorie estimates + first-ever client read of runs.
ALTER TABLE public.users ADD COLUMN IF NOT EXISTS weight_lbs numeric;

-- The client has never SELECTed public.runs (saves go through the SECURITY DEFINER RPC).
-- Enable RLS (idempotent) and let owners read their own rows.
ALTER TABLE public.runs ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'runs' AND cmd = 'SELECT'
  ) THEN
    CREATE POLICY runs_select_own ON public.runs
      FOR SELECT TO authenticated USING (user_id = auth.uid());
  END IF;
END $$;
