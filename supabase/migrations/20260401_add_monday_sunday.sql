ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'weekly_monday';
ALTER TYPE event_type ADD VALUE IF NOT EXISTS 'weekly_sunday';
ALTER TYPE run_day ADD VALUE IF NOT EXISTS 'monday';
ALTER TYPE run_day ADD VALUE IF NOT EXISTS 'sunday';

INSERT INTO public.channels (name, type, description) VALUES
  ('monday-trinity-groves', 'run_day', 'Monday night runs at Trinity Groves')
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.channels (name, type, description) VALUES
  ('sunday-levy-plaza', 'run_day', 'Sunday morning runs at Levy Event Plaza')
ON CONFLICT (name) DO NOTHING;
