# Run It UP! Dallas — Run Club App Design Spec

**Date:** March 31, 2026
**Author:** Nelson Taylor / Taylormade Creative
**Status:** Approved — ready for implementation planning

---

## 1. Overview

A native-looking PWA for Run It UP! Dallas run club — a cold pitch demo built speculatively to show founder Theo Murdaugh what's possible. The app is fully functional (not a mockup), deployed to Netlify, and demoed in person on a phone.

**Pitch line:** "I built your run club an app. Sign up."

### 1.1 Goals
- Showcase Nelson's app design/dev skills to land Run It UP! as a client
- Deliver a working product that solves real problems the club has today
- Replace fragmented tools (Eventbrite, Google Calendar, Mailchimp, Linktree) with one unified experience
- Address the #1 community pain point: newbies having nobody to run with

### 1.2 Non-Goals
- GPS run tracking (members already use Strava/Apple Watch)
- Direct messages (Phase 2)
- Payment processing
- Push notifications (limited on web PWA — Phase 2 with native app)
- Admin dashboard (Theo manages via admin tools in chat for now)

---

## 2. Target User

Run It UP! Dallas members and prospective members:
- Predominantly Black and Brown runners aged 20-40
- All fitness levels — walkers to 7-minute milers
- Many are first-time runners who found RIU through social media
- Motivated by community, accountability, and culture — not competition
- Currently coordinate via Instagram DMs, Strava, and word of mouth

---

## 3. Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | HTML / CSS / JavaScript (vanilla) |
| Backend | Supabase (Auth, Database, Realtime, Storage) |
| Hosting | Netlify |
| Native (future) | Capacitor 8 (iOS + Android) |
| Maps | Google Maps Embed or Apple Maps link-outs |

**Why this stack:**
- Same pattern as Nelson's artist player builds (proven, fast to ship)
- Supabase already scoped for the salon booking app — familiar territory
- Zero server management. Free tiers cover demo + early adoption.
- Capacitor-ready if Theo wants native apps later (upsell opportunity)

---

## 4. Branding

### 4.1 Color Palette

| Token | Hex | Usage |
|-------|-----|-------|
| `--color-bg` | `#0A0A0A` | App background |
| `--color-surface` | `#1A1A1A` | Cards, elevated surfaces |
| `--color-surface-hover` | `#252525` | Card hover/active states |
| `--color-primary` | `#BFFF00` | Primary accent, CTAs, check-in button, user's chat bubbles |
| `--color-secondary` | `#FF6B2B` | Secondary accent, badges, special events, streaks |
| `--color-text` | `#FFFFFF` | Primary text |
| `--color-text-muted` | `#8A8A8A` | Secondary text, timestamps |
| `--color-success` | `#00C853` | Check-in confirmed, streak active |
| `--color-error` | `#FF3B30` | Errors, destructive actions |

### 4.2 Typography

- **Headlines:** Bold, uppercase, blocky sans-serif (e.g., Big Shoulders Display or similar — matches their streetwear/urban energy)
- **Body:** Clean sans-serif (Montserrat or Inter) for readability
- **Numbers/Stats:** Tabular lining figures, bold weight for leaderboard and stats

### 4.3 Design Language

- Dark mode by default (matches RIU brand — black merch, black logo background)
- High contrast neon accents on dark surfaces
- Rounded corners on cards (12px border-radius)
- Subtle elevation via lighter surface colors (no drop shadows)
- Bottom tab bar navigation — 5 tabs, no hamburger menu
- Mobile-first (375px base), responsive up to tablet

---

## 5. Authentication & Onboarding

### 5.1 Splash Screen
- RIU logo centered on black background
- Tagline: "Built By the Community, Powered by Purpose"
- "Get Started" button (neon green)
- "Already have an account? Log In" link

### 5.2 Sign Up
- Email + password (Supabase Auth)
- Google OAuth as alternative
- All accounts are free — no paid tier (mirrors RIU's free model)

### 5.3 Profile Setup (post-signup)
- **Step 1:** Name + profile photo (upload or camera)
- **Step 2:** Select pace group — single select:
  - Walk It Up (walkers / 16+ min/mile)
  - Jog It Up (joggers / 12-16 min/mile)
  - Run It Up (runners / 8-12 min/mile)
  - Sprint It Up (fast / under 8 min/mile)
- **Step 3:** Select home run days — multi-select:
  - Tuesday (Deep Ellum, 7 PM)
  - Saturday (Fair Oaks Park, 8 AM)
  - Both
- After setup: auto-join relevant chat channels, drop into Home screen

### 5.4 Login
- Email + password
- Google OAuth
- "Forgot password" flow (Supabase built-in)

---

## 6. Screen Specifications

### 6.1 Home

The first screen after login. Answers: "When's the next run and am I showing up?"

**Layout (top to bottom):**

1. **Header Bar**
   - RIU logo (left)
   - Notification bell with badge count (right)
   - Profile avatar thumbnail (right)

2. **Next Run Card** (hero element)
   - "NEXT RUN" label in muted text
   - Day + location in bold (e.g., "TUESDAY — DEEP ELLUM")
   - Countdown timer: days / hours / minutes (live updating)
   - Address line + "Get Directions" link (opens Maps)
   - Large neon green **"CHECK IN"** button
   - Button states:
     - Disabled/gray: too early (more than 30 min before start)
     - Active/neon green: within check-in window (30 min before to 1 hour after start)
     - Completed/green checkmark: already checked in
   - After check-in: "How far did you run?" slider (1, 2, 3, 4, 5+ miles) — optional, can skip

3. **Your Streak Bar**
   - Flame icon + streak count (e.g., "12 Week Streak")
   - Row of 8 dots showing last 8 weeks — filled (attended) or hollow (missed)
   - Tap to go to full Stats screen

4. **Community Highlights** (horizontal scrollable cards)
   - Dynamic feed showing recent activity:
     - "[Name] just hit a 10-week streak"
     - "Tuesday Deep Ellum had 247 check-ins"
     - "[Name] earned the Night Runner badge"
   - Tapping a highlight goes to relevant screen (profile, stats, events)

5. **Upcoming Special Event** (conditional — only shows if one exists)
   - Event cover image, name, date, RSVP count
   - Tap to open full event details in Events tab

### 6.2 Events

Two sections: regular weekly rhythm and special events.

**Weekly Runs (top section, always visible):**
- Two persistent cards:
  - **Tuesday** — Deep Ellum, 7 PM, 2 miles
  - **Saturday** — Fair Oaks Park, 8 AM, 3-5 miles
- Each card shows:
  - Day, location, time, distance
  - "Get Directions" map link
  - Last week's check-in count (e.g., "183 showed up last Tuesday")
  - Check-in button (same states as Home)
  - **"Looking for a buddy?"** button (see Run Buddy below)
  - Buddy count: "3 people looking for a buddy"

**Special Events (scrollable section below):**
- Full event cards:
  - Cover image (admin-uploaded via Supabase Storage)
  - Event title
  - Date + time
  - Location + map link
  - Description text
  - RSVP button + attendee count ("47 going")
  - Countdown timer (for upcoming)
  - Post-event: photo recap gallery (member-uploaded photos)
- Examples: Anniversary 5K, Wine Down Wednesday Mixer, Dear Fathers Night, Adult Field Day, Juneteenth Run

**Calendar View Toggle:**
- Button to switch between list view and monthly calendar
- Calendar shows dots: green (weekly run), orange (special event)
- Tap any date to see that day's details

**Run Buddy Feature:**
- Available on each weekly run card
- Tap "Looking for a buddy?" to add yourself to that run's buddy board
- Buddy board shows: name, photo, pace group badge, optional intro line (e.g., "First time at Deep Ellum, don't want to run alone!")
- Other members on the board can tap **"Run Together"** on your card
- Both people receive a notification: "You and [Name] are running together [Day] at [Location]!"
- Matched buddies see each other highlighted on the buddy board
- Filtered by pace group by default (Walk It Up sees other Walk It Up members first)
- Resets after each run day

### 6.3 Community (Group Chat)

Real-time group messaging powered by Supabase Realtime.

**Pre-built Channels:**

By Run Day:
- `#tuesday-deep-ellum`
- `#saturday-fair-oaks`
- `#trail-runs`

By Pace Group:
- `#walk-it-up`
- `#jog-it-up`
- `#run-it-up`
- `#sprint-it-up`

Social:
- `#general` (main hangout — everyone auto-joined)
- `#newbies` (safe space for first-timers — everyone auto-joined)
- `#post-run-pics`
- `#fit-check` (outfit pics before runs)

**Auto-join logic:** On signup, user is auto-joined to:
- Their pace group channel
- Their run day channel(s)
- `#general` and `#newbies`

Users can manually join/leave any channel.

**Chat UI:**
- Channel list view: channel name, last message preview, unread count badge
- Chat view: dark background, message bubbles
  - User's messages: neon green bubbles, right-aligned
  - Others' messages: dark gray bubbles, left-aligned
  - Each message shows: avatar, name, pace group badge, timestamp
- Photo sharing: tap camera icon to upload image (Supabase Storage)
- Pinned messages: sticky at top of chat (admin feature)
- New message indicator: red badge on Community tab icon

**Admin Tools (for Theo / run captains):**
- Pin/unpin messages
- Delete messages
- Mute members (timed or permanent)
- Admin role assigned via Supabase user metadata

### 6.4 My Stats

Gamification hub — the sticky factor that keeps people opening the app between runs.

**Stats Dashboard (top section):**
- **Attendance Streak** — hero stat, large flame icon + number + "Week Streak"
- **Total Check-ins** — lifetime count
- **Total Miles** — cumulative self-reported miles
- **Member Since** — join date

**Badges (scrollable grid):**
Earned badges full color, locked badges grayed out with hint text.

| Badge | Requirement |
|-------|------------|
| First Step | First check-in |
| Early Bird | 5 Saturday morning runs |
| Night Runner | 5 Tuesday evening runs |
| Streak Week | 4-week attendance streak |
| On Fire | 12-week attendance streak |
| Century Club | 100 total miles |
| Run Buddy | Used buddy feature 3 times |
| Day One | Attended a special event |
| Both Sides | Tuesday + Saturday check-in same week |
| Social Butterfly | Sent 50 messages in community chat |

**Leaderboard:**
- Toggle tabs: Streak / Miles / Check-ins
- Top 10 list: rank, avatar, name, pace group badge, stat value
- User's own rank highlighted (even if not top 10)
- Sub-tabs: Weekly / All-Time
- Philosophy: celebrates consistency, not speed. A walker with a 20-week streak outranks a sprinter who shows up twice.

**Check-in History:**
- Calendar view with green dots on attended days
- Tap any date: which run, miles logged, badge earned that day

### 6.5 Profile

**Your Profile:**
- Profile photo (editable)
- Display name
- Pace group badge (Walk It Up / Jog It Up / Run It Up / Sprint It Up)
- Home run days (Tuesday / Saturday / Both)
- Member since date
- Stats row: streak, check-ins, miles (mini version)
- Badge showcase: top 3 pinned badges (user-selectable)
- "Edit Profile" button
- "Log Out" button

**Other Members' Profiles (tap from chat or leaderboard):**
- Same layout, read-only
- "Run Together" button (opens buddy match for next run)
- Their badge showcase + full stats

---

## 7. Data Model (Supabase)

### 7.1 Tables

**users** (extends Supabase auth.users)
- id (uuid, FK to auth.users)
- display_name (text)
- avatar_url (text)
- pace_group (enum: walk_it_up, jog_it_up, run_it_up, sprint_it_up)
- run_days (text array: ['tuesday', 'saturday'])
- role (enum: member, captain, admin)
- created_at (timestamp)

**check_ins**
- id (uuid)
- user_id (FK to users)
- event_type (enum: weekly_tuesday, weekly_saturday, special)
- event_id (FK to special_events, nullable)
- miles (decimal, nullable)
- checked_in_at (timestamp)

**special_events**
- id (uuid)
- title (text)
- description (text)
- cover_image_url (text)
- location_name (text)
- location_address (text)
- event_date (timestamp)
- created_by (FK to users)
- created_at (timestamp)

**event_rsvps**
- id (uuid)
- event_id (FK to special_events)
- user_id (FK to users)
- created_at (timestamp)

**event_photos**
- id (uuid)
- event_id (FK to special_events)
- user_id (FK to users)
- photo_url (text)
- created_at (timestamp)

**channels**
- id (uuid)
- name (text, unique)
- type (enum: run_day, pace_group, social)
- description (text)
- created_at (timestamp)

**channel_members**
- channel_id (FK to channels)
- user_id (FK to users)
- joined_at (timestamp)

**messages**
- id (uuid)
- channel_id (FK to channels)
- user_id (FK to users)
- content (text)
- image_url (text, nullable)
- is_pinned (boolean, default false)
- created_at (timestamp)

**buddy_requests**
- id (uuid)
- user_id (FK to users)
- run_day (enum: tuesday, saturday)
- run_date (date)
- intro_line (text, nullable)
- matched_with (FK to users, nullable)
- created_at (timestamp)

**badges**
- id (uuid)
- user_id (FK to users)
- badge_type (text)
- earned_at (timestamp)

**pinned_badges**
- user_id (FK to users)
- badge_id (FK to badges)
- slot (integer, 1-3)

### 7.2 Realtime Subscriptions
- `messages` table — subscribe by channel_id for live chat
- `buddy_requests` table — subscribe by run_day + run_date for live buddy board
- `check_ins` table — subscribe for community highlights feed

### 7.3 Storage Buckets
- `avatars` — user profile photos
- `event-covers` — special event cover images
- `event-photos` — post-event photo gallery uploads
- `chat-images` — images shared in group chat

### 7.4 Row Level Security (RLS)
- Users can only update their own profile
- Users can only create their own check-ins, messages, RSVPs, buddy requests
- Messages visible to all channel members
- Admin/captain roles can delete messages, pin messages, mute users
- All authenticated users can read events, channels, leaderboard data

---

## 8. Navigation

**Bottom Tab Bar (5 tabs):**

| Icon | Label | Screen |
|------|-------|--------|
| Home icon | Home | Home screen |
| Calendar icon | Events | Events + Run Buddy |
| Chat icon | Community | Group chat channels |
| Chart icon | Stats | My Stats + leaderboard |
| Person icon | Profile | User profile |

- Active tab: neon green icon + label
- Inactive tabs: muted gray icons
- Notification badges: red dot on Community (unread messages), Events (new buddy match)
- No hamburger menu. Ever.

---

## 9. Demo Seeding

To make the demo feel alive when Theo sees it, pre-seed the database with:

- 15-20 fake member profiles with diverse avatars (Black men and women, various ages)
- 50+ messages across channels (realistic conversation — "who's pulling up Tuesday?", run pics, fit checks)
- Check-in history showing 100+ check-ins across members
- 2-3 special events (one past with photo gallery, one upcoming, one far future)
- 5-6 buddy requests on the next upcoming run
- Leaderboard with realistic streaks and miles
- A few members with impressive badge collections

This makes the app feel like an active community, not an empty shell.

---

## 10. Deployment

- **URL:** Deploy to Netlify (e.g., runitup-app.netlify.app or custom subdomain)
- **PWA Manifest:** App name "Run It UP!", RIU logo as app icon, standalone display mode, black theme color
- **Service Worker:** Cache static assets for offline shell (content requires network)
- **OG Image:** Branded social share image if Theo shares the link
- **Mobile-first:** Optimized for iPhone demo in person

---

## 11. Future Phases (Pitch Upsells)

Not built for the demo, but mentioned in conversation with Theo:

- **Phase 2:** Direct messages, push notifications (native app), Strava API integration
- **Phase 3:** iOS + Android native apps via Capacitor, Apple Health / Google Fit sync
- **Phase 4:** Admin dashboard (event creation, member management, analytics), merch store integration
- **Phase 5:** Multi-chapter support (Run It UP! Houston, Run It UP! Atlanta — Theo's HBCU expansion vision)

---

## 12. Success Criteria

The demo is successful if:
1. Theo can sign up on his phone in under 30 seconds
2. He sees the next Tuesday/Saturday run with real details
3. He can check in and see his stats update
4. He opens Community chat and sees an active-looking group
5. He sees the Run Buddy feature and says "we need this"
6. He asks "how much?" — that's the close
