-- ===== ENUMS =====
CREATE TYPE pace_group AS ENUM ('walk_it_up', 'jog_it_up', 'run_it_up', 'sprint_it_up');
CREATE TYPE user_role AS ENUM ('member', 'captain', 'admin');
CREATE TYPE event_type AS ENUM ('weekly_tuesday', 'weekly_saturday', 'special');
CREATE TYPE run_day AS ENUM ('tuesday', 'saturday');
CREATE TYPE channel_type AS ENUM ('run_day', 'pace_group', 'social');

-- ===== USERS (extends auth.users) =====
CREATE TABLE public.users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT NOT NULL,
  avatar_url TEXT,
  pace_group pace_group NOT NULL DEFAULT 'jog_it_up',
  run_days TEXT[] NOT NULL DEFAULT '{}',
  role user_role NOT NULL DEFAULT 'member',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users can read all profiles" ON public.users FOR SELECT USING (true);
CREATE POLICY "Users can update own profile" ON public.users FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Users can insert own profile" ON public.users FOR INSERT WITH CHECK (auth.uid() = id);

-- ===== CHECK-INS =====
CREATE TABLE public.check_ins (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  event_type event_type NOT NULL,
  event_id UUID,
  miles DECIMAL(4,1),
  checked_in_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_checkins_user ON public.check_ins(user_id);
CREATE INDEX idx_checkins_date ON public.check_ins(checked_in_at);

ALTER TABLE public.check_ins ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read check-ins" ON public.check_ins FOR SELECT USING (true);
CREATE POLICY "Users can create own check-ins" ON public.check_ins FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ===== SPECIAL EVENTS =====
CREATE TABLE public.special_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  description TEXT,
  cover_image_url TEXT,
  location_name TEXT NOT NULL,
  location_address TEXT NOT NULL,
  event_date TIMESTAMPTZ NOT NULL,
  created_by UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.special_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read events" ON public.special_events FOR SELECT USING (true);
CREATE POLICY "Admins can insert events" ON public.special_events
  FOR INSERT WITH CHECK (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'captain'))
  );
CREATE POLICY "Admins can update events" ON public.special_events
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'captain'))
  );
CREATE POLICY "Admins can delete events" ON public.special_events
  FOR DELETE USING (
    EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'captain'))
  );

-- ===== EVENT RSVPs =====
CREATE TABLE public.event_rsvps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.special_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(event_id, user_id)
);

ALTER TABLE public.event_rsvps ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read RSVPs" ON public.event_rsvps FOR SELECT USING (true);
CREATE POLICY "Users can manage own RSVPs" ON public.event_rsvps FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own RSVPs" ON public.event_rsvps FOR DELETE USING (auth.uid() = user_id);

-- ===== EVENT PHOTOS =====
CREATE TABLE public.event_photos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id UUID NOT NULL REFERENCES public.special_events(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  photo_url TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.event_photos ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read event photos" ON public.event_photos FOR SELECT USING (true);
CREATE POLICY "Users can upload event photos" ON public.event_photos FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ===== CHANNELS =====
CREATE TABLE public.channels (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  type channel_type NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read channels" ON public.channels FOR SELECT USING (true);

-- ===== CHANNEL MEMBERS =====
CREATE TABLE public.channel_members (
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (channel_id, user_id)
);

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read channel members" ON public.channel_members FOR SELECT USING (true);
CREATE POLICY "Users can join channels" ON public.channel_members FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can leave channels" ON public.channel_members FOR DELETE USING (auth.uid() = user_id);

-- ===== MESSAGES =====
CREATE TABLE public.messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel_id UUID NOT NULL REFERENCES public.channels(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  content TEXT NOT NULL,
  image_url TEXT,
  is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_messages_channel ON public.messages(channel_id, created_at);

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Channel members can read messages" ON public.messages FOR SELECT USING (
  EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
);
CREATE POLICY "Channel members can send messages" ON public.messages FOR INSERT WITH CHECK (
  auth.uid() = user_id AND
  EXISTS (SELECT 1 FROM public.channel_members WHERE channel_id = messages.channel_id AND user_id = auth.uid())
);
CREATE POLICY "Admins can update messages" ON public.messages FOR UPDATE USING (
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'captain'))
);
CREATE POLICY "Admins can delete messages" ON public.messages FOR DELETE USING (
  auth.uid() = user_id OR
  EXISTS (SELECT 1 FROM public.users WHERE id = auth.uid() AND role IN ('admin', 'captain'))
);

-- ===== BUDDY REQUESTS =====
CREATE TABLE public.buddy_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  run_day run_day NOT NULL,
  run_date DATE NOT NULL,
  intro_line TEXT,
  matched_with UUID REFERENCES public.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, run_day, run_date)
);

ALTER TABLE public.buddy_requests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read buddy requests" ON public.buddy_requests FOR SELECT USING (true);
CREATE POLICY "Users can create own buddy requests" ON public.buddy_requests FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own buddy requests" ON public.buddy_requests FOR UPDATE USING (auth.uid() = user_id OR auth.uid() = matched_with);

-- ===== BADGES =====
CREATE TABLE public.badges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_type TEXT NOT NULL,
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, badge_type)
);

ALTER TABLE public.badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read badges" ON public.badges FOR SELECT USING (true);
CREATE POLICY "Users can earn badges" ON public.badges FOR INSERT WITH CHECK (auth.uid() = user_id);

-- ===== PINNED BADGES =====
CREATE TABLE public.pinned_badges (
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  badge_id UUID NOT NULL REFERENCES public.badges(id) ON DELETE CASCADE,
  slot INTEGER NOT NULL CHECK (slot BETWEEN 1 AND 3),
  PRIMARY KEY (user_id, slot)
);

ALTER TABLE public.pinned_badges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read pinned badges" ON public.pinned_badges FOR SELECT USING (true);
CREATE POLICY "Users can manage own pins" ON public.pinned_badges FOR ALL USING (auth.uid() = user_id);

-- ===== SEED CHANNELS =====
INSERT INTO public.channels (name, type, description) VALUES
  ('tuesday-deep-ellum', 'run_day', 'Tuesday night runs at Deep Ellum'),
  ('saturday-fair-oaks', 'run_day', 'Saturday morning runs at Fair Oaks Park'),
  ('trail-runs', 'run_day', 'Trail run coordination and meetups'),
  ('walk-it-up', 'pace_group', 'Walkers — every step counts'),
  ('jog-it-up', 'pace_group', 'Joggers — finding our rhythm'),
  ('run-it-up', 'pace_group', 'Runners — let''s get it'),
  ('sprint-it-up', 'pace_group', 'Fast crew — catch us if you can'),
  ('general', 'social', 'Main hangout — everyone welcome'),
  ('newbies', 'social', 'New to Run It UP? Start here. No question is a bad question.'),
  ('post-run-pics', 'social', 'Drop your post-run pics here'),
  ('fit-check', 'social', 'Show us what you''re running in');

-- ===== ENABLE REALTIME =====
ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
ALTER PUBLICATION supabase_realtime ADD TABLE public.buddy_requests;
ALTER PUBLICATION supabase_realtime ADD TABLE public.check_ins;
