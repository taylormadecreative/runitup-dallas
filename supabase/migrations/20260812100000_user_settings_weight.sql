-- Weight must be self-only: public.users is world-readable (pre-existing policy),
-- so body weight lives in its own RLS-locked table instead.
CREATE TABLE IF NOT EXISTS public.user_settings (
  user_id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  weight_lbs numeric,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.user_settings ENABLE ROW LEVEL SECURITY;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='user_settings') THEN
    CREATE POLICY user_settings_self ON public.user_settings
      FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
  END IF;
END $$;
-- Remove the column added earlier today before anything consumes it — it inherited
-- the users table's world-readable policy.
ALTER TABLE public.users DROP COLUMN IF EXISTS weight_lbs;
