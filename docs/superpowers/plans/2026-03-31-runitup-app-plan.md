# Run It UP! Dallas App — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully functional PWA for Run It UP! Dallas run club as a cold pitch demo — real auth, real-time group chat, check-in gamification, Run Buddy matching, deployed to Netlify.

**Architecture:** Vanilla HTML/CSS/JS frontend with Supabase backend (Auth, Database, Realtime, Storage). Single-page app with client-side routing via hash fragments. Bottom tab bar navigation, 5 screens. Dark mode, mobile-first (375px base). PWA with service worker and manifest.

**Tech Stack:** HTML/CSS/JS (vanilla), Supabase JS SDK v2, Netlify, Google Fonts (Big Shoulders Display + Inter)

**Review Process:** After each phase completion, run the mandatory 4-agent senior review panel (Senior App Developer, Senior Art Director, Senior Marketing Strategist, Senior UX Designer). All 4 reviewers grade A-F, list top 3 strengths, top 3 issues with file + line references, and specific fixes. Fix ALL issues before proceeding to next phase. This is non-negotiable.

---

## File Structure

```
runitup-app/
├── index.html                  # Single HTML entry point, all screens
├── manifest.json               # PWA manifest
├── sw.js                       # Service worker
├── css/
│   ├── variables.css           # CSS custom properties (colors, fonts, spacing)
│   ├── base.css                # Reset, typography, global styles
│   ├── components.css          # Shared components (cards, buttons, badges, tab bar)
│   ├── auth.css                # Splash, login, signup, onboarding screens
│   ├── home.css                # Home screen
│   ├── events.css              # Events + Run Buddy + calendar
│   ├── community.css           # Channel list + chat view
│   ├── stats.css               # Stats dashboard + leaderboard + badges
│   └── profile.css             # Profile screen
├── js/
│   ├── app.js                  # App init, router, tab bar, global state
│   ├── supabase.js             # Supabase client init + helper functions
│   ├── auth.js                 # Auth flows (signup, login, logout, onboarding)
│   ├── home.js                 # Home screen logic (next run, countdown, streak, highlights)
│   ├── events.js               # Events screen (weekly runs, special events, calendar toggle)
│   ├── buddy.js                # Run Buddy feature (request, match, board)
│   ├── community.js            # Group chat (channel list, messages, realtime, photo upload)
│   ├── stats.js                # Stats, badges, leaderboard, check-in history
│   ├── profile.js              # Profile view/edit, other member profiles
│   ├── checkin.js              # Check-in logic (time window, miles slider, badge awarding)
│   └── seed.js                 # Demo seeding script (run once to populate DB)
├── assets/
│   ├── logo.svg                # RIU logo (recreated as SVG)
│   ├── logo-192.png            # PWA icon 192x192
│   ├── logo-512.png            # PWA icon 512x512
│   ├── og-image.png            # Social share image
│   ├── icons/                  # Tab bar + UI icons (SVG)
│   └── seed-avatars/           # Placeholder avatars for demo seeding
├── supabase/
│   └── schema.sql              # Complete database schema + RLS policies + seed channels
└── docs/
    └── superpowers/
        ├── specs/
        │   └── 2026-03-31-runitup-app-design.md
        └── plans/
            └── 2026-03-31-runitup-app-plan.md
```

---

## Phase 1: Foundation (Project Setup + Supabase + Auth)

### Task 1: Project Scaffolding + CSS Foundation

**Files:**
- Create: `index.html`
- Create: `css/variables.css`
- Create: `css/base.css`
- Create: `css/components.css`
- Create: `manifest.json`
- Create: `sw.js`

- [ ] **Step 1: Create index.html with all screen containers**

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover, user-scalable=no">
  <meta name="theme-color" content="#0A0A0A">
  <meta name="apple-mobile-web-app-capable" content="yes">
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent">
  <meta name="description" content="Run It UP! Dallas — Built By the Community, Powered by Purpose">
  <meta property="og:title" content="Run It UP! Dallas">
  <meta property="og:description" content="The official app for Dallas's run club. Check in, connect, run together.">
  <meta property="og:image" content="/assets/og-image.png">
  <title>Run It UP! | Dallas Run Club</title>
  <link rel="manifest" href="/manifest.json">
  <link rel="icon" href="/assets/logo-192.png">
  <link rel="apple-touch-icon" href="/assets/logo-192.png">
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Big+Shoulders+Display:wght@600;700;800&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="/css/variables.css">
  <link rel="stylesheet" href="/css/base.css">
  <link rel="stylesheet" href="/css/components.css">
  <link rel="stylesheet" href="/css/auth.css">
  <link rel="stylesheet" href="/css/home.css">
  <link rel="stylesheet" href="/css/events.css">
  <link rel="stylesheet" href="/css/community.css">
  <link rel="stylesheet" href="/css/stats.css">
  <link rel="stylesheet" href="/css/profile.css">
</head>
<body>
  <!-- Auth Screens -->
  <div id="screen-splash" class="screen active">
    <!-- Splash content rendered by auth.js -->
  </div>
  <div id="screen-login" class="screen">
    <!-- Login form rendered by auth.js -->
  </div>
  <div id="screen-signup" class="screen">
    <!-- Signup form rendered by auth.js -->
  </div>
  <div id="screen-onboarding" class="screen">
    <!-- Onboarding steps rendered by auth.js -->
  </div>

  <!-- App Shell (visible after auth) -->
  <div id="app-shell" class="hidden">
    <!-- Header -->
    <header id="app-header">
      <img src="/assets/logo.svg" alt="Run It UP!" class="header-logo">
      <div class="header-right">
        <button id="btn-notifications" class="icon-btn" aria-label="Notifications">
          <svg class="icon" viewBox="0 0 24 24"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.63-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.64 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>
          <span id="notification-badge" class="badge hidden">0</span>
        </button>
        <button id="btn-header-profile" class="avatar-btn" aria-label="Profile">
          <img id="header-avatar" src="" alt="" class="avatar-sm">
        </button>
      </div>
    </header>

    <!-- Screen Containers -->
    <main id="app-main">
      <div id="screen-home" class="screen active"></div>
      <div id="screen-events" class="screen"></div>
      <div id="screen-community" class="screen"></div>
      <div id="screen-stats" class="screen"></div>
      <div id="screen-profile" class="screen"></div>
      <div id="screen-member-profile" class="screen"></div>
      <div id="screen-chat" class="screen"></div>
      <div id="screen-buddy-board" class="screen"></div>
      <div id="screen-event-detail" class="screen"></div>
    </main>

    <!-- Bottom Tab Bar -->
    <nav id="tab-bar">
      <button class="tab active" data-screen="home" aria-label="Home">
        <svg class="tab-icon" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
        <span class="tab-label">Home</span>
      </button>
      <button class="tab" data-screen="events" aria-label="Events">
        <svg class="tab-icon" viewBox="0 0 24 24"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11z"/></svg>
        <span class="tab-label">Events</span>
      </button>
      <button class="tab" data-screen="community" aria-label="Community">
        <svg class="tab-icon" viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H6l-2 2V4h16v12z"/></svg>
        <span class="tab-label">Community</span>
        <span id="community-badge" class="badge hidden">0</span>
      </button>
      <button class="tab" data-screen="stats" aria-label="Stats">
        <svg class="tab-icon" viewBox="0 0 24 24"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>
        <span class="tab-label">Stats</span>
      </button>
      <button class="tab" data-screen="profile" aria-label="Profile">
        <svg class="tab-icon" viewBox="0 0 24 24"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        <span class="tab-label">Profile</span>
      </button>
    </nav>
  </div>

  <!-- Scripts -->
  <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
  <script src="/js/supabase.js"></script>
  <script src="/js/auth.js"></script>
  <script src="/js/checkin.js"></script>
  <script src="/js/home.js"></script>
  <script src="/js/events.js"></script>
  <script src="/js/buddy.js"></script>
  <script src="/js/community.js"></script>
  <script src="/js/stats.js"></script>
  <script src="/js/profile.js"></script>
  <script src="/js/app.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create css/variables.css**

```css
:root {
  /* Colors */
  --color-bg: #0A0A0A;
  --color-surface: #1A1A1A;
  --color-surface-hover: #252525;
  --color-primary: #BFFF00;
  --color-primary-dark: #99CC00;
  --color-secondary: #FF6B2B;
  --color-text: #FFFFFF;
  --color-text-muted: #8A8A8A;
  --color-success: #00C853;
  --color-error: #FF3B30;
  --color-badge-bg: #FF3B30;

  /* Typography */
  --font-display: 'Big Shoulders Display', sans-serif;
  --font-body: 'Inter', sans-serif;

  /* Spacing */
  --space-xs: 4px;
  --space-sm: 8px;
  --space-md: 16px;
  --space-lg: 24px;
  --space-xl: 32px;
  --space-2xl: 48px;

  /* Radii */
  --radius-sm: 8px;
  --radius-md: 12px;
  --radius-lg: 16px;
  --radius-full: 9999px;

  /* Layout */
  --header-height: 56px;
  --tab-bar-height: 72px;
  --safe-area-bottom: env(safe-area-inset-bottom, 0px);
}
```

- [ ] **Step 3: Create css/base.css**

```css
*, *::before, *::after {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}

html, body {
  height: 100%;
  overflow: hidden;
  background: var(--color-bg);
  color: var(--color-text);
  font-family: var(--font-body);
  font-size: 16px;
  line-height: 1.5;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  -webkit-tap-highlight-color: transparent;
  user-select: none;
}

h1, h2, h3, h4 {
  font-family: var(--font-display);
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.02em;
  line-height: 1.1;
}

h1 { font-size: 2rem; }
h2 { font-size: 1.5rem; }
h3 { font-size: 1.25rem; }
h4 { font-size: 1rem; }

p { color: var(--color-text-muted); }

a {
  color: var(--color-primary);
  text-decoration: none;
}

button {
  font-family: var(--font-body);
  cursor: pointer;
  border: none;
  background: none;
  color: var(--color-text);
}

img {
  max-width: 100%;
  display: block;
}

input, textarea {
  font-family: var(--font-body);
  font-size: 16px; /* prevent iOS zoom */
}

.hidden { display: none !important; }

.screen {
  display: none;
  height: 100%;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

.screen.active { display: block; }

/* Scrollbar styling */
.screen::-webkit-scrollbar { width: 0; }
```

- [ ] **Step 4: Create css/components.css with shared components**

```css
/* ===== APP SHELL ===== */
#app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
}

#app-shell.hidden { display: none; }

#app-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  height: var(--header-height);
  padding: 0 var(--space-md);
  background: var(--color-bg);
  border-bottom: 1px solid var(--color-surface);
  flex-shrink: 0;
  position: sticky;
  top: 0;
  z-index: 100;
}

.header-logo {
  height: 32px;
  width: auto;
}

.header-right {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

#app-main {
  flex: 1;
  overflow: hidden;
  position: relative;
}

#app-main > .screen {
  position: absolute;
  inset: 0;
  padding: var(--space-md);
  padding-bottom: var(--space-lg);
}

/* ===== TAB BAR ===== */
#tab-bar {
  display: flex;
  align-items: center;
  justify-content: space-around;
  height: var(--tab-bar-height);
  padding-bottom: var(--safe-area-bottom);
  background: var(--color-surface);
  border-top: 1px solid var(--color-surface-hover);
  flex-shrink: 0;
  position: relative;
  z-index: 100;
}

.tab {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: var(--space-sm) var(--space-md);
  position: relative;
  transition: color 0.2s;
}

.tab-icon {
  width: 24px;
  height: 24px;
  fill: var(--color-text-muted);
  transition: fill 0.2s;
}

.tab-label {
  font-size: 10px;
  font-weight: 600;
  color: var(--color-text-muted);
  transition: color 0.2s;
}

.tab.active .tab-icon { fill: var(--color-primary); }
.tab.active .tab-label { color: var(--color-primary); }

/* ===== BADGES (notification dots) ===== */
.badge {
  position: absolute;
  top: 2px;
  right: 2px;
  min-width: 16px;
  height: 16px;
  padding: 0 4px;
  background: var(--color-badge-bg);
  color: var(--color-text);
  font-size: 10px;
  font-weight: 700;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===== BUTTONS ===== */
.btn-primary {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  background: var(--color-primary);
  color: var(--color-bg);
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: var(--radius-md);
  transition: opacity 0.2s, transform 0.1s;
}

.btn-primary:active { transform: scale(0.98); opacity: 0.9; }
.btn-primary:disabled { opacity: 0.4; cursor: not-allowed; transform: none; }

.btn-secondary {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 100%;
  padding: var(--space-md) var(--space-lg);
  background: transparent;
  color: var(--color-primary);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border: 2px solid var(--color-primary);
  border-radius: var(--radius-md);
  transition: opacity 0.2s;
}

.btn-secondary:active { opacity: 0.7; }

.btn-orange {
  background: var(--color-secondary);
  color: var(--color-text);
}

.btn-sm {
  padding: var(--space-sm) var(--space-md);
  font-size: 0.875rem;
}

.icon-btn {
  width: 40px;
  height: 40px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  position: relative;
}

.icon-btn .icon {
  width: 24px;
  height: 24px;
  fill: var(--color-text);
}

/* ===== CARDS ===== */
.card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.card-elevated {
  background: var(--color-surface-hover);
}

/* ===== AVATARS ===== */
.avatar-sm {
  width: 32px;
  height: 32px;
  border-radius: var(--radius-full);
  object-fit: cover;
  background: var(--color-surface-hover);
}

.avatar-md {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-full);
  object-fit: cover;
  background: var(--color-surface-hover);
}

.avatar-lg {
  width: 80px;
  height: 80px;
  border-radius: var(--radius-full);
  object-fit: cover;
  background: var(--color-surface-hover);
}

.avatar-xl {
  width: 120px;
  height: 120px;
  border-radius: var(--radius-full);
  object-fit: cover;
  background: var(--color-surface-hover);
}

/* ===== PACE GROUP BADGES ===== */
.pace-badge {
  display: inline-flex;
  align-items: center;
  padding: 2px var(--space-sm);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  border-radius: var(--radius-full);
  background: var(--color-surface-hover);
  color: var(--color-text-muted);
}

.pace-badge.walk_it_up { background: #1B5E20; color: #A5D6A7; }
.pace-badge.jog_it_up { background: #0D47A1; color: #90CAF9; }
.pace-badge.run_it_up { background: #4A148C; color: #CE93D8; }
.pace-badge.sprint_it_up { background: #BF360C; color: #FFAB91; }

/* ===== FORM INPUTS ===== */
.form-group {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.form-label {
  font-size: 0.875rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.form-input {
  width: 100%;
  padding: var(--space-md);
  background: var(--color-surface);
  border: 2px solid var(--color-surface-hover);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-size: 1rem;
  transition: border-color 0.2s;
}

.form-input:focus {
  outline: none;
  border-color: var(--color-primary);
}

.form-input::placeholder { color: var(--color-text-muted); }

.form-error {
  font-size: 0.75rem;
  color: var(--color-error);
}

/* ===== LOADING SPINNER ===== */
.spinner {
  width: 24px;
  height: 24px;
  border: 3px solid var(--color-surface-hover);
  border-top-color: var(--color-primary);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-screen {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
}

/* ===== EMPTY STATE ===== */
.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  padding: var(--space-2xl);
  text-align: center;
  gap: var(--space-md);
}

.empty-state p {
  font-size: 0.875rem;
}

/* ===== TOAST NOTIFICATIONS ===== */
#toast-container {
  position: fixed;
  top: calc(var(--header-height) + var(--space-md));
  left: var(--space-md);
  right: var(--space-md);
  z-index: 1000;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  pointer-events: none;
}

.toast {
  background: var(--color-surface);
  border: 1px solid var(--color-surface-hover);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  color: var(--color-text);
  font-size: 0.875rem;
  font-weight: 500;
  animation: slideDown 0.3s ease-out;
  pointer-events: auto;
}

.toast.success { border-left: 4px solid var(--color-success); }
.toast.error { border-left: 4px solid var(--color-error); }
.toast.info { border-left: 4px solid var(--color-primary); }

@keyframes slideDown {
  from { transform: translateY(-20px); opacity: 0; }
  to { transform: translateY(0); opacity: 1; }
}
```

- [ ] **Step 5: Create manifest.json**

```json
{
  "name": "Run It UP! | Dallas Run Club",
  "short_name": "Run It UP!",
  "description": "Built By the Community, Powered by Purpose",
  "start_url": "/",
  "display": "standalone",
  "background_color": "#0A0A0A",
  "theme_color": "#0A0A0A",
  "orientation": "portrait",
  "icons": [
    {
      "src": "/assets/logo-192.png",
      "sizes": "192x192",
      "type": "image/png",
      "purpose": "any maskable"
    },
    {
      "src": "/assets/logo-512.png",
      "sizes": "512x512",
      "type": "image/png",
      "purpose": "any maskable"
    }
  ]
}
```

- [ ] **Step 6: Create sw.js (service worker)**

```js
const CACHE_NAME = 'runitup-v1';
const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/manifest.json',
  '/css/variables.css',
  '/css/base.css',
  '/css/components.css',
  '/css/auth.css',
  '/css/home.css',
  '/css/events.css',
  '/css/community.css',
  '/css/stats.css',
  '/css/profile.css',
  '/js/app.js',
  '/js/supabase.js',
  '/js/auth.js',
  '/js/home.js',
  '/js/events.js',
  '/js/buddy.js',
  '/js/community.js',
  '/js/stats.js',
  '/js/profile.js',
  '/js/checkin.js',
  '/assets/logo.svg',
  '/assets/logo-192.png',
  '/assets/logo-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(STATIC_ASSETS))
  );
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', (event) => {
  if (event.request.url.includes('supabase')) return;
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});
```

- [ ] **Step 7: Verify project loads in browser**

Run: Open `index.html` via a local server (e.g., `npx serve .` or `python3 -m http.server 3000`)
Expected: Black screen with no errors in console. Fonts loading from Google.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat: project scaffolding — HTML shell, CSS foundation, PWA manifest, service worker"
```

---

### Task 2: Supabase Setup + Database Schema

**Files:**
- Create: `supabase/schema.sql`
- Create: `js/supabase.js`

- [ ] **Step 1: Create a Supabase project**

Go to https://supabase.com/dashboard and create a new project:
- Name: `runitup-dallas`
- Region: US East
- Copy the **Project URL** and **anon public key** from Settings > API

- [ ] **Step 2: Create supabase/schema.sql with complete schema**

```sql
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
CREATE POLICY "Admins can manage events" ON public.special_events FOR ALL USING (
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
```

- [ ] **Step 3: Run schema.sql in Supabase SQL Editor**

Go to Supabase Dashboard > SQL Editor. Paste and run the entire schema.sql file.
Expected: All tables created, RLS enabled, channels seeded, realtime enabled. No errors.

- [ ] **Step 4: Create Supabase Storage buckets**

In Supabase Dashboard > Storage, create these buckets:
- `avatars` — Public bucket (allow public reads)
- `event-covers` — Public bucket
- `event-photos` — Public bucket
- `chat-images` — Public bucket

For each bucket, add a policy allowing authenticated users to upload:
- Policy name: "Authenticated users can upload"
- Allowed operation: INSERT
- Policy: `(auth.role() = 'authenticated')`

And a public read policy:
- Policy name: "Public read"
- Allowed operation: SELECT
- Policy: `true`

- [ ] **Step 5: Create js/supabase.js**

```js
// Replace these with your Supabase project credentials
const SUPABASE_URL = 'https://YOUR_PROJECT_ID.supabase.co';
const SUPABASE_ANON_KEY = 'YOUR_ANON_KEY';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== AUTH HELPERS =====
async function signUp(email, password) {
  const { data, error } = await supabase.auth.signUp({ email, password });
  if (error) throw error;
  return data;
}

async function signIn(email, password) {
  const { data, error } = await supabase.auth.signInWithPassword({ email, password });
  if (error) throw error;
  return data;
}

async function signInWithGoogle() {
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: window.location.origin }
  });
  if (error) throw error;
  return data;
}

async function signOut() {
  const { error } = await supabase.auth.signOut();
  if (error) throw error;
}

async function getSession() {
  const { data: { session } } = await supabase.auth.getSession();
  return session;
}

async function getCurrentUser() {
  const session = await getSession();
  if (!session) return null;
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', session.user.id)
    .single();
  if (error && error.code !== 'PGRST116') throw error;
  return data;
}

// ===== PROFILE HELPERS =====
async function createUserProfile(profile) {
  const { data, error } = await supabase
    .from('users')
    .insert(profile)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function updateUserProfile(id, updates) {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data;
}

async function getUserProfile(id) {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .eq('id', id)
    .single();
  if (error) throw error;
  return data;
}

// ===== UPLOAD HELPER =====
async function uploadFile(bucket, path, file) {
  const { data, error } = await supabase.storage
    .from(bucket)
    .upload(path, file, { upsert: true });
  if (error) throw error;
  const { data: { publicUrl } } = supabase.storage
    .from(bucket)
    .getPublicUrl(path);
  return publicUrl;
}

// ===== TOAST HELPER =====
function showToast(message, type = 'info') {
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// ===== DATE HELPERS =====
function getNextRunDate(dayOfWeek) {
  // dayOfWeek: 2 = Tuesday, 6 = Saturday
  const now = new Date();
  const current = now.getDay();
  let daysUntil = dayOfWeek - current;
  if (daysUntil < 0) daysUntil += 7;
  if (daysUntil === 0) {
    // If it's the same day, check if the run has passed
    const runHour = dayOfWeek === 2 ? 19 : 8; // 7PM Tue, 8AM Sat
    if (now.getHours() >= runHour + 1) daysUntil = 7;
  }
  const next = new Date(now);
  next.setDate(now.getDate() + daysUntil);
  next.setHours(dayOfWeek === 2 ? 19 : 8, 0, 0, 0);
  return next;
}

function formatCountdown(targetDate) {
  const now = new Date();
  const diff = targetDate - now;
  if (diff <= 0) return { days: 0, hours: 0, minutes: 0, active: true };
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
  const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
  return { days, hours, minutes, active: false };
}

function isCheckInWindow(targetDate) {
  const now = new Date();
  const windowStart = new Date(targetDate.getTime() - 30 * 60 * 1000); // 30 min before
  const windowEnd = new Date(targetDate.getTime() + 60 * 60 * 1000); // 1 hour after
  return now >= windowStart && now <= windowEnd;
}

function formatDate(dateStr) {
  return new Date(dateStr).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric'
  });
}

function formatTime(dateStr) {
  return new Date(dateStr).toLocaleTimeString('en-US', {
    hour: 'numeric', minute: '2-digit'
  });
}

function formatRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(dateStr);
}

// ===== PACE GROUP DISPLAY =====
const PACE_GROUPS = {
  walk_it_up: { label: 'Walk It Up', pace: '16+ min/mi' },
  jog_it_up: { label: 'Jog It Up', pace: '12-16 min/mi' },
  run_it_up: { label: 'Run It Up', pace: '8-12 min/mi' },
  sprint_it_up: { label: 'Sprint It Up', pace: 'Under 8 min/mi' }
};

function paceGroupBadgeHTML(paceGroup) {
  const info = PACE_GROUPS[paceGroup];
  if (!info) return '';
  return `<span class="pace-badge ${paceGroup}">${info.label}</span>`;
}

// ===== WEEKLY RUN DATA =====
const WEEKLY_RUNS = [
  {
    day: 'tuesday',
    dayOfWeek: 2,
    label: 'TUESDAY',
    location: 'Deep Ellum',
    address: 'Deep Ellum, Dallas, TX',
    mapsUrl: 'https://maps.google.com/?q=Deep+Ellum+Dallas+TX',
    time: '7:00 PM',
    distance: '2 miles',
    eventType: 'weekly_tuesday'
  },
  {
    day: 'saturday',
    dayOfWeek: 6,
    label: 'SATURDAY',
    location: 'Fair Oaks Park',
    address: '7501 Fair Oaks Ave, Dallas, TX 75231',
    mapsUrl: 'https://maps.google.com/?q=Fair+Oaks+Park+Dallas+TX',
    time: '8:00 AM',
    distance: '3-5 miles',
    eventType: 'weekly_saturday'
  }
];
```

- [ ] **Step 6: Verify Supabase connection**

Temporarily add to the bottom of `js/supabase.js`:
```js
// Test connection — remove after verifying
(async () => {
  const { data, error } = await supabase.from('channels').select('name');
  console.log('Supabase channels:', data, error);
})();
```

Run the app in browser. Check console for the 11 seeded channels.
Expected: Array of 11 channel names logged, no errors.
Then remove the test code.

- [ ] **Step 7: Commit**

```bash
git add supabase/schema.sql js/supabase.js
git commit -m "feat: Supabase schema, RLS policies, storage buckets, JS client with helpers"
```

---

### Task 3: Authentication + Onboarding Screens

**Files:**
- Create: `css/auth.css`
- Create: `js/auth.js`

- [ ] **Step 1: Create css/auth.css**

```css
/* ===== SPLASH SCREEN ===== */
#screen-splash {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100vh;
  height: 100dvh;
  padding: var(--space-xl);
  background: var(--color-bg);
  text-align: center;
}

.splash-logo {
  width: 180px;
  height: 180px;
  margin-bottom: var(--space-xl);
  animation: pulseGlow 2s ease-in-out infinite;
}

@keyframes pulseGlow {
  0%, 100% { filter: drop-shadow(0 0 8px rgba(191, 255, 0, 0.3)); }
  50% { filter: drop-shadow(0 0 20px rgba(191, 255, 0, 0.6)); }
}

.splash-tagline {
  font-family: var(--font-body);
  font-size: 0.875rem;
  color: var(--color-text-muted);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  margin-bottom: var(--space-2xl);
}

.splash-buttons {
  width: 100%;
  max-width: 320px;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.splash-login-link {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-align: center;
  margin-top: var(--space-md);
}

.splash-login-link a {
  color: var(--color-primary);
  font-weight: 600;
}

/* ===== LOGIN / SIGNUP SCREENS ===== */
#screen-login,
#screen-signup {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  padding: var(--space-xl);
  background: var(--color-bg);
}

.auth-header {
  margin-bottom: var(--space-xl);
}

.auth-header h1 {
  font-size: 2rem;
  margin-bottom: var(--space-xs);
}

.auth-header p {
  font-size: 0.875rem;
}

.auth-form {
  flex: 1;
  display: flex;
  flex-direction: column;
}

.auth-form .form-group { margin-bottom: var(--space-md); }

.auth-actions {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
  padding-bottom: var(--space-xl);
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  color: var(--color-text-muted);
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.auth-divider::before,
.auth-divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: var(--color-surface-hover);
}

.btn-google {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: var(--space-sm);
  width: 100%;
  padding: var(--space-md);
  background: var(--color-surface);
  border: 2px solid var(--color-surface-hover);
  border-radius: var(--radius-md);
  color: var(--color-text);
  font-weight: 600;
  font-size: 1rem;
}

.auth-switch {
  text-align: center;
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.auth-switch a {
  color: var(--color-primary);
  font-weight: 600;
}

.auth-back {
  color: var(--color-text-muted);
  font-size: 0.875rem;
  margin-bottom: var(--space-md);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

/* ===== ONBOARDING ===== */
#screen-onboarding {
  display: flex;
  flex-direction: column;
  height: 100vh;
  height: 100dvh;
  padding: var(--space-xl);
  background: var(--color-bg);
}

.onboarding-progress {
  display: flex;
  gap: var(--space-sm);
  margin-bottom: var(--space-xl);
}

.progress-dot {
  flex: 1;
  height: 4px;
  border-radius: 2px;
  background: var(--color-surface-hover);
  transition: background 0.3s;
}

.progress-dot.active { background: var(--color-primary); }
.progress-dot.done { background: var(--color-primary); }

.onboarding-step {
  flex: 1;
  display: none;
  flex-direction: column;
}

.onboarding-step.active {
  display: flex;
}

.onboarding-step h2 {
  margin-bottom: var(--space-sm);
}

.onboarding-step > p {
  margin-bottom: var(--space-xl);
}

.onboarding-actions {
  margin-top: auto;
  padding-bottom: var(--space-xl);
}

/* ===== AVATAR UPLOAD ===== */
.avatar-upload {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-md);
  margin-bottom: var(--space-lg);
}

.avatar-upload-preview {
  width: 120px;
  height: 120px;
  border-radius: var(--radius-full);
  background: var(--color-surface);
  border: 3px dashed var(--color-surface-hover);
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  cursor: pointer;
  transition: border-color 0.2s;
}

.avatar-upload-preview:hover { border-color: var(--color-primary); }

.avatar-upload-preview img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.avatar-upload-preview .placeholder-icon {
  width: 40px;
  height: 40px;
  fill: var(--color-text-muted);
}

/* ===== OPTION SELECT (pace group / run days) ===== */
.option-grid {
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

.option-card {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  background: var(--color-surface);
  border: 2px solid var(--color-surface-hover);
  border-radius: var(--radius-md);
  cursor: pointer;
  transition: border-color 0.2s, background 0.2s;
}

.option-card.selected {
  border-color: var(--color-primary);
  background: rgba(191, 255, 0, 0.05);
}

.option-card .option-emoji {
  font-size: 1.5rem;
  width: 40px;
  text-align: center;
}

.option-card .option-info h4 {
  font-family: var(--font-body);
  font-size: 1rem;
  font-weight: 600;
  text-transform: none;
  letter-spacing: normal;
}

.option-card .option-info p {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin: 0;
}
```

- [ ] **Step 2: Create js/auth.js**

```js
// ===== AUTH STATE =====
let currentUser = null;
let currentProfile = null;

// ===== RENDER SPLASH =====
function renderSplash() {
  document.getElementById('screen-splash').innerHTML = `
    <img src="/assets/logo.svg" alt="Run It UP!" class="splash-logo">
    <p class="splash-tagline">Built By the Community, Powered by Purpose</p>
    <div class="splash-buttons">
      <button class="btn-primary" onclick="showScreen('signup')">Get Started</button>
      <p class="splash-login-link">Already have an account? <a href="#" onclick="showScreen('login'); return false;">Log In</a></p>
    </div>
  `;
}

// ===== RENDER LOGIN =====
function renderLogin() {
  document.getElementById('screen-login').innerHTML = `
    <button class="auth-back" onclick="showScreen('splash')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Back
    </button>
    <div class="auth-header">
      <h1>Welcome Back</h1>
      <p>Log in to your Run It UP! account</p>
    </div>
    <form class="auth-form" onsubmit="handleLogin(event)">
      <div class="form-group">
        <label class="form-label" for="login-email">Email</label>
        <input class="form-input" type="email" id="login-email" placeholder="your@email.com" required autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label" for="login-password">Password</label>
        <input class="form-input" type="password" id="login-password" placeholder="Enter your password" required autocomplete="current-password">
      </div>
      <div id="login-error" class="form-error hidden"></div>
      <div class="auth-actions">
        <button type="submit" class="btn-primary" id="btn-login">Log In</button>
        <div class="auth-divider">or</div>
        <button type="button" class="btn-google" onclick="handleGoogleAuth()">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        <p class="auth-switch">Don't have an account? <a href="#" onclick="showScreen('signup'); return false;">Sign Up</a></p>
      </div>
    </form>
  `;
}

// ===== RENDER SIGNUP =====
function renderSignup() {
  document.getElementById('screen-signup').innerHTML = `
    <button class="auth-back" onclick="showScreen('splash')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Back
    </button>
    <div class="auth-header">
      <h1>Join the Crew</h1>
      <p>Create your Run It UP! account</p>
    </div>
    <form class="auth-form" onsubmit="handleSignup(event)">
      <div class="form-group">
        <label class="form-label" for="signup-email">Email</label>
        <input class="form-input" type="email" id="signup-email" placeholder="your@email.com" required autocomplete="email">
      </div>
      <div class="form-group">
        <label class="form-label" for="signup-password">Password</label>
        <input class="form-input" type="password" id="signup-password" placeholder="Create a password (min 6 chars)" required minlength="6" autocomplete="new-password">
      </div>
      <div id="signup-error" class="form-error hidden"></div>
      <div class="auth-actions">
        <button type="submit" class="btn-primary" id="btn-signup">Create Account</button>
        <div class="auth-divider">or</div>
        <button type="button" class="btn-google" onclick="handleGoogleAuth()">
          <svg width="18" height="18" viewBox="0 0 18 18"><path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908c1.702-1.567 2.684-3.874 2.684-6.615z" fill="#4285F4"/><path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332C2.438 15.983 5.482 18 9 18z" fill="#34A853"/><path d="M3.964 10.71c-.18-.54-.282-1.117-.282-1.71s.102-1.17.282-1.71V4.958H.957C.347 6.173 0 7.548 0 9s.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/><path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0 5.482 0 2.438 2.017.957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/></svg>
          Continue with Google
        </button>
        <p class="auth-switch">Already have an account? <a href="#" onclick="showScreen('login'); return false;">Log In</a></p>
      </div>
    </form>
  `;
}

// ===== RENDER ONBOARDING =====
let onboardingStep = 1;
let onboardingData = { display_name: '', avatar_url: null, pace_group: null, run_days: [] };

function renderOnboarding() {
  onboardingStep = 1;
  onboardingData = { display_name: '', avatar_url: null, pace_group: null, run_days: [] };

  document.getElementById('screen-onboarding').innerHTML = `
    <div class="onboarding-progress">
      <div class="progress-dot active" id="progress-1"></div>
      <div class="progress-dot" id="progress-2"></div>
      <div class="progress-dot" id="progress-3"></div>
    </div>

    <!-- Step 1: Name + Avatar -->
    <div class="onboarding-step active" id="onboarding-step-1">
      <h2>Who Are You?</h2>
      <p>Let the crew know who's pulling up</p>
      <div class="avatar-upload">
        <label class="avatar-upload-preview" for="avatar-input">
          <svg class="placeholder-icon" viewBox="0 0 24 24" fill="currentColor"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>
        </label>
        <input type="file" id="avatar-input" accept="image/*" class="hidden" onchange="handleAvatarUpload(event)">
        <span style="font-size: 0.75rem; color: var(--color-text-muted);">Tap to add a photo</span>
      </div>
      <div class="form-group">
        <label class="form-label" for="onboarding-name">Display Name</label>
        <input class="form-input" type="text" id="onboarding-name" placeholder="What should we call you?" required>
      </div>
      <div class="onboarding-actions">
        <button class="btn-primary" onclick="nextOnboardingStep()">Next</button>
      </div>
    </div>

    <!-- Step 2: Pace Group -->
    <div class="onboarding-step" id="onboarding-step-2">
      <h2>Your Pace</h2>
      <p>No wrong answers — every level is welcome</p>
      <div class="option-grid">
        <button class="option-card" onclick="selectPaceGroup(this, 'walk_it_up')">
          <span class="option-emoji">\u{1F6B6}</span>
          <div class="option-info">
            <h4>Walk It Up</h4>
            <p>16+ min/mile — every step counts</p>
          </div>
        </button>
        <button class="option-card" onclick="selectPaceGroup(this, 'jog_it_up')">
          <span class="option-emoji">\u{1F3C3}</span>
          <div class="option-info">
            <h4>Jog It Up</h4>
            <p>12-16 min/mile — finding our rhythm</p>
          </div>
        </button>
        <button class="option-card" onclick="selectPaceGroup(this, 'run_it_up')">
          <span class="option-emoji">\u{1F525}</span>
          <div class="option-info">
            <h4>Run It Up</h4>
            <p>8-12 min/mile — let's get it</p>
          </div>
        </button>
        <button class="option-card" onclick="selectPaceGroup(this, 'sprint_it_up')">
          <span class="option-emoji">\u{26A1}</span>
          <div class="option-info">
            <h4>Sprint It Up</h4>
            <p>Under 8 min/mile — catch us if you can</p>
          </div>
        </button>
      </div>
      <div class="onboarding-actions">
        <button class="btn-primary" onclick="nextOnboardingStep()" id="btn-pace-next" disabled>Next</button>
      </div>
    </div>

    <!-- Step 3: Run Days -->
    <div class="onboarding-step" id="onboarding-step-3">
      <h2>When Do You Run?</h2>
      <p>Pick your days — you can always change this later</p>
      <div class="option-grid">
        <button class="option-card" onclick="toggleRunDay(this, 'tuesday')">
          <span class="option-emoji">\u{1F303}</span>
          <div class="option-info">
            <h4>Tuesday Nights</h4>
            <p>Deep Ellum — 7:00 PM — 2 miles</p>
          </div>
        </button>
        <button class="option-card" onclick="toggleRunDay(this, 'saturday')">
          <span class="option-emoji">\u{1F305}</span>
          <div class="option-info">
            <h4>Saturday Mornings</h4>
            <p>Fair Oaks Park — 8:00 AM — 3-5 miles</p>
          </div>
        </button>
      </div>
      <div class="onboarding-actions">
        <button class="btn-primary" onclick="completeOnboarding()" id="btn-days-done" disabled>Let's Run</button>
      </div>
    </div>
  `;
}

// ===== AUTH HANDLERS =====
async function handleLogin(event) {
  event.preventDefault();
  const email = document.getElementById('login-email').value;
  const password = document.getElementById('login-password').value;
  const errorEl = document.getElementById('login-error');
  const btn = document.getElementById('btn-login');

  btn.disabled = true;
  btn.textContent = 'Logging in...';
  errorEl.classList.add('hidden');

  try {
    await signIn(email, password);
    await loadUserAndEnterApp();
  } catch (err) {
    errorEl.textContent = err.message || 'Login failed. Check your credentials.';
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Log In';
  }
}

async function handleSignup(event) {
  event.preventDefault();
  const email = document.getElementById('signup-email').value;
  const password = document.getElementById('signup-password').value;
  const errorEl = document.getElementById('signup-error');
  const btn = document.getElementById('btn-signup');

  btn.disabled = true;
  btn.textContent = 'Creating account...';
  errorEl.classList.add('hidden');

  try {
    await signUp(email, password);
    // After signup, go to onboarding
    renderOnboarding();
    showScreen('onboarding');
  } catch (err) {
    errorEl.textContent = err.message || 'Signup failed. Try again.';
    errorEl.classList.remove('hidden');
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
}

async function handleGoogleAuth() {
  try {
    await signInWithGoogle();
  } catch (err) {
    showToast(err.message || 'Google sign-in failed', 'error');
  }
}

// ===== ONBOARDING HANDLERS =====
function handleAvatarUpload(event) {
  const file = event.target.files[0];
  if (!file) return;
  onboardingData._avatarFile = file;
  const reader = new FileReader();
  reader.onload = (e) => {
    const preview = document.querySelector('.avatar-upload-preview');
    preview.innerHTML = `<img src="${e.target.result}" alt="Avatar preview">`;
  };
  reader.readAsDataURL(file);
}

function selectPaceGroup(el, group) {
  document.querySelectorAll('#onboarding-step-2 .option-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  onboardingData.pace_group = group;
  document.getElementById('btn-pace-next').disabled = false;
}

function toggleRunDay(el, day) {
  el.classList.toggle('selected');
  const idx = onboardingData.run_days.indexOf(day);
  if (idx >= 0) {
    onboardingData.run_days.splice(idx, 1);
  } else {
    onboardingData.run_days.push(day);
  }
  document.getElementById('btn-days-done').disabled = onboardingData.run_days.length === 0;
}

function nextOnboardingStep() {
  if (onboardingStep === 1) {
    const name = document.getElementById('onboarding-name').value.trim();
    if (!name) { showToast('Please enter your name', 'error'); return; }
    onboardingData.display_name = name;
  }

  document.getElementById(`onboarding-step-${onboardingStep}`).classList.remove('active');
  document.getElementById(`progress-${onboardingStep}`).classList.remove('active');
  document.getElementById(`progress-${onboardingStep}`).classList.add('done');

  onboardingStep++;

  document.getElementById(`onboarding-step-${onboardingStep}`).classList.add('active');
  document.getElementById(`progress-${onboardingStep}`).classList.add('active');
}

async function completeOnboarding() {
  const btn = document.getElementById('btn-days-done');
  btn.disabled = true;
  btn.textContent = 'Setting up...';

  try {
    const session = await getSession();
    if (!session) throw new Error('No session');

    // Upload avatar if selected
    let avatarUrl = null;
    if (onboardingData._avatarFile) {
      const ext = onboardingData._avatarFile.name.split('.').pop();
      const path = `${session.user.id}/avatar.${ext}`;
      avatarUrl = await uploadFile('avatars', path, onboardingData._avatarFile);
    }

    // Create user profile
    const profile = await createUserProfile({
      id: session.user.id,
      display_name: onboardingData.display_name,
      avatar_url: avatarUrl,
      pace_group: onboardingData.pace_group,
      run_days: onboardingData.run_days,
      role: 'member'
    });

    // Auto-join channels
    await autoJoinChannels(profile);

    currentProfile = profile;
    enterApp();
  } catch (err) {
    showToast(err.message || 'Setup failed. Please try again.', 'error');
    btn.disabled = false;
    btn.textContent = "Let's Run";
  }
}

async function autoJoinChannels(profile) {
  // Get all channels
  const { data: channels } = await supabase.from('channels').select('id, name, type');
  if (!channels) return;

  const toJoin = [];

  // Always join general + newbies
  channels.filter(c => c.name === 'general' || c.name === 'newbies')
    .forEach(c => toJoin.push({ channel_id: c.id, user_id: profile.id }));

  // Join pace group channel
  const paceChannelName = profile.pace_group.replace(/_/g, '-');
  const paceChannel = channels.find(c => c.name === paceChannelName);
  if (paceChannel) toJoin.push({ channel_id: paceChannel.id, user_id: profile.id });

  // Join run day channels
  if (profile.run_days.includes('tuesday')) {
    const ch = channels.find(c => c.name === 'tuesday-deep-ellum');
    if (ch) toJoin.push({ channel_id: ch.id, user_id: profile.id });
  }
  if (profile.run_days.includes('saturday')) {
    const ch = channels.find(c => c.name === 'saturday-fair-oaks');
    if (ch) toJoin.push({ channel_id: ch.id, user_id: profile.id });
  }

  if (toJoin.length > 0) {
    await supabase.from('channel_members').insert(toJoin);
  }
}

// ===== APP ENTRY =====
async function loadUserAndEnterApp() {
  const profile = await getCurrentUser();
  if (!profile) {
    // User exists in auth but no profile — needs onboarding
    renderOnboarding();
    showScreen('onboarding');
    return;
  }
  currentProfile = profile;
  enterApp();
}

function enterApp() {
  // Hide all auth screens
  document.querySelectorAll('#screen-splash, #screen-login, #screen-signup, #screen-onboarding')
    .forEach(s => { s.classList.remove('active'); s.style.display = 'none'; });

  // Show app shell
  document.getElementById('app-shell').classList.remove('hidden');

  // Set header avatar
  const headerAvatar = document.getElementById('header-avatar');
  headerAvatar.src = currentProfile.avatar_url || '';
  headerAvatar.alt = currentProfile.display_name;

  // Initialize screens
  if (typeof initHome === 'function') initHome();
  if (typeof initEvents === 'function') initEvents();
  if (typeof initCommunity === 'function') initCommunity();
  if (typeof initStats === 'function') initStats();
  if (typeof initProfile === 'function') initProfile();

  // Show home screen
  navigateTo('home');
}

// ===== SCREEN NAVIGATION (auth screens) =====
function showScreen(name) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  const screen = document.getElementById(`screen-${name}`);
  if (screen) screen.classList.add('active');
}
```

- [ ] **Step 3: Test auth flow in browser**

Run the local server, navigate to the app.
Expected:
- Splash screen renders with logo, tagline, "Get Started" button
- Tapping "Get Started" shows signup form
- Tapping "Log In" link shows login form
- Back buttons work
- Creating an account with email/password leads to onboarding
- Onboarding steps progress correctly (name → pace group → run days)

- [ ] **Step 4: Commit**

```bash
git add css/auth.css js/auth.js
git commit -m "feat: auth screens — splash, login, signup, onboarding with pace group + run day selection"
```

---

### Task 4: App Router + Tab Bar Navigation

**Files:**
- Create: `js/app.js`

- [ ] **Step 1: Create js/app.js**

```js
// ===== APP INITIALIZATION =====
document.addEventListener('DOMContentLoaded', async () => {
  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }

  // Render auth screens
  renderSplash();
  renderLogin();
  renderSignup();

  // Check for existing session
  const session = await getSession();
  if (session) {
    await loadUserAndEnterApp();
  } else {
    showScreen('splash');
  }

  // Listen for auth state changes (e.g., Google OAuth redirect)
  supabase.auth.onAuthStateChange(async (event, session) => {
    if (event === 'SIGNED_IN' && session) {
      await loadUserAndEnterApp();
    }
    if (event === 'SIGNED_OUT') {
      currentUser = null;
      currentProfile = null;
      document.getElementById('app-shell').classList.add('hidden');
      document.querySelectorAll('#screen-splash, #screen-login, #screen-signup, #screen-onboarding')
        .forEach(s => { s.style.display = ''; });
      renderSplash();
      showScreen('splash');
    }
  });

  // Tab bar navigation
  document.querySelectorAll('#tab-bar .tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const screen = tab.dataset.screen;
      navigateTo(screen);
    });
  });

  // Header profile button
  document.getElementById('btn-header-profile')?.addEventListener('click', () => {
    navigateTo('profile');
  });
});

// ===== TAB NAVIGATION =====
let currentScreen = 'home';

function navigateTo(screen) {
  // Hide all app screens
  document.querySelectorAll('#app-main > .screen').forEach(s => s.classList.remove('active'));

  // Show target screen
  const target = document.getElementById(`screen-${screen}`);
  if (target) target.classList.add('active');

  // Update tab bar active state
  document.querySelectorAll('#tab-bar .tab').forEach(t => t.classList.remove('active'));
  const activeTab = document.querySelector(`#tab-bar .tab[data-screen="${screen}"]`);
  if (activeTab) activeTab.classList.add('active');

  currentScreen = screen;

  // Trigger screen-specific refresh if needed
  if (screen === 'home' && typeof refreshHome === 'function') refreshHome();
  if (screen === 'events' && typeof refreshEvents === 'function') refreshEvents();
  if (screen === 'community' && typeof refreshCommunity === 'function') refreshCommunity();
  if (screen === 'stats' && typeof refreshStats === 'function') refreshStats();
  if (screen === 'profile' && typeof refreshProfile === 'function') refreshProfile();
}

// Navigate to sub-screens (chat, buddy board, event detail, member profile)
function navigateToSub(screen) {
  document.querySelectorAll('#app-main > .screen').forEach(s => s.classList.remove('active'));
  const target = document.getElementById(`screen-${screen}`);
  if (target) target.classList.add('active');

  // Don't update tab bar — sub-screens keep parent tab active
}

function navigateBack() {
  navigateTo(currentScreen);
}
```

- [ ] **Step 2: Verify full auth → app shell flow**

Run in browser:
- Create a new account
- Complete onboarding
- Verify app shell appears with header + tab bar
- Verify tapping tabs switches the active screen container
- Verify tab bar highlights active tab in neon green

- [ ] **Step 3: Commit**

```bash
git add js/app.js
git commit -m "feat: app router — tab bar navigation, auth state listener, sub-screen navigation"
```

---

### PHASE 1 REVIEW GATE

**STOP.** Run the mandatory 4-agent senior review panel before proceeding to Phase 2.

Deploy all 4 reviewers in a single agent dispatch:
1. **Senior App Developer** — test auth flow end-to-end, check Supabase RLS policies, verify PWA manifest, check for XSS in user inputs, test offline shell
2. **Senior Art Director** — review color consistency across auth screens, typography hierarchy, dark mode contrast ratios, splash animation, onboarding visual flow
3. **Senior Marketing Strategist** — review all copy (splash tagline, onboarding prompts, button labels, pace group descriptions), check if the language matches RIU's voice (hype, inclusive, street-culture energy), evaluate first-impression experience
4. **Senior UX Designer** — test onboarding flow for friction, verify touch targets meet 44px minimum, check input focus states, review progress indicator, evaluate back-navigation patterns

Each reviewer grades A-F, lists top 3 strengths, top 3 issues (file + line), and specific fixes.
Fix ALL issues before proceeding.

---

## Phase 2: Core Screens (Home + Events + Check-in)

### Task 5: Check-in Logic

**Files:**
- Create: `js/checkin.js`

- [ ] **Step 1: Create js/checkin.js**

```js
// ===== CHECK-IN SYSTEM =====

async function checkIn(eventType, eventId = null) {
  if (!currentProfile) return;

  // Check if already checked in today for this event type
  const today = new Date().toISOString().split('T')[0];
  const { data: existing } = await supabase
    .from('check_ins')
    .select('id')
    .eq('user_id', currentProfile.id)
    .eq('event_type', eventType)
    .gte('checked_in_at', today + 'T00:00:00')
    .lte('checked_in_at', today + 'T23:59:59')
    .maybeSingle();

  if (existing) {
    showToast('You already checked in for this run!', 'info');
    return null;
  }

  const { data, error } = await supabase
    .from('check_ins')
    .insert({
      user_id: currentProfile.id,
      event_type: eventType,
      event_id: eventId,
      checked_in_at: new Date().toISOString()
    })
    .select()
    .single();

  if (error) {
    showToast('Check-in failed. Try again.', 'error');
    throw error;
  }

  showToast("You're checked in! Let's run!", 'success');

  // Check for new badges after check-in
  await checkAndAwardBadges();

  return data;
}

async function logMiles(checkInId, miles) {
  const { error } = await supabase
    .from('check_ins')
    .update({ miles })
    .eq('id', checkInId);

  if (error) {
    showToast('Failed to log miles', 'error');
    return;
  }
  showToast(`${miles} miles logged!`, 'success');

  // Re-check badges (Century Club depends on miles)
  await checkAndAwardBadges();
}

async function getCheckInCountForEvent(eventType, daysBack = 7) {
  const since = new Date();
  since.setDate(since.getDate() - daysBack);

  const { count } = await supabase
    .from('check_ins')
    .select('*', { count: 'exact', head: true })
    .eq('event_type', eventType)
    .gte('checked_in_at', since.toISOString());

  return count || 0;
}

async function hasCheckedInToday(eventType) {
  if (!currentProfile) return false;
  const today = new Date().toISOString().split('T')[0];
  const { data } = await supabase
    .from('check_ins')
    .select('id')
    .eq('user_id', currentProfile.id)
    .eq('event_type', eventType)
    .gte('checked_in_at', today + 'T00:00:00')
    .lte('checked_in_at', today + 'T23:59:59')
    .maybeSingle();
  return !!data;
}

async function getUserCheckIns(userId) {
  const { data } = await supabase
    .from('check_ins')
    .select('*')
    .eq('user_id', userId)
    .order('checked_in_at', { ascending: false });
  return data || [];
}

async function getUserStats(userId) {
  const checkIns = await getUserCheckIns(userId);

  const totalCheckIns = checkIns.length;
  const totalMiles = checkIns.reduce((sum, c) => sum + (c.miles || 0), 0);
  const streak = calculateStreak(checkIns);
  const weekHistory = getWeekHistory(checkIns, 8);

  return { totalCheckIns, totalMiles, streak, weekHistory, checkIns };
}

function calculateStreak(checkIns) {
  if (checkIns.length === 0) return 0;

  // Group check-ins by week (Mon-Sun)
  const weeks = new Map();
  checkIns.forEach(ci => {
    const date = new Date(ci.checked_in_at);
    const weekStart = getWeekStart(date);
    const key = weekStart.toISOString().split('T')[0];
    weeks.set(key, true);
  });

  // Count consecutive weeks from current week backwards
  let streak = 0;
  const now = new Date();
  let weekStart = getWeekStart(now);

  while (true) {
    const key = weekStart.toISOString().split('T')[0];
    if (weeks.has(key)) {
      streak++;
      weekStart.setDate(weekStart.getDate() - 7);
    } else {
      break;
    }
  }

  return streak;
}

function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // Monday
  d.setDate(diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

function getWeekHistory(checkIns, numWeeks) {
  const history = [];
  const now = new Date();

  for (let i = 0; i < numWeeks; i++) {
    const weekStart = getWeekStart(new Date(now.getTime() - i * 7 * 24 * 60 * 60 * 1000));
    const weekEnd = new Date(weekStart.getTime() + 7 * 24 * 60 * 60 * 1000);

    const attended = checkIns.some(ci => {
      const d = new Date(ci.checked_in_at);
      return d >= weekStart && d < weekEnd;
    });

    history.unshift(attended); // oldest first
  }

  return history;
}

// ===== MILES SLIDER MODAL =====
function showMilesSlider(checkInId) {
  const overlay = document.createElement('div');
  overlay.className = 'miles-overlay';
  overlay.innerHTML = `
    <div class="miles-modal card">
      <h3>How Far Did You Run?</h3>
      <p style="color: var(--color-text-muted); margin-bottom: var(--space-lg);">Optional — tap skip if you don't know</p>
      <div class="miles-options">
        <button class="miles-btn" data-miles="1">1 mi</button>
        <button class="miles-btn" data-miles="2">2 mi</button>
        <button class="miles-btn" data-miles="3">3 mi</button>
        <button class="miles-btn" data-miles="4">4 mi</button>
        <button class="miles-btn" data-miles="5">5+ mi</button>
      </div>
      <button class="btn-secondary btn-sm" style="margin-top: var(--space-md);" onclick="closeMilesSlider()">Skip</button>
    </div>
  `;

  overlay.querySelectorAll('.miles-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const miles = parseFloat(btn.dataset.miles);
      await logMiles(checkInId, miles);
      closeMilesSlider();
      if (typeof refreshHome === 'function') refreshHome();
      if (typeof refreshStats === 'function') refreshStats();
    });
  });

  document.body.appendChild(overlay);
}

function closeMilesSlider() {
  document.querySelector('.miles-overlay')?.remove();
}

// ===== BADGE SYSTEM =====
const BADGE_DEFINITIONS = [
  { type: 'first_step', label: 'First Step', description: 'First check-in', icon: '\u{1F463}' },
  { type: 'early_bird', label: 'Early Bird', description: '5 Saturday morning runs', icon: '\u{1F305}' },
  { type: 'night_runner', label: 'Night Runner', description: '5 Tuesday evening runs', icon: '\u{1F303}' },
  { type: 'streak_week', label: 'Streak Week', description: '4-week attendance streak', icon: '\u{1F4AA}' },
  { type: 'on_fire', label: 'On Fire', description: '12-week attendance streak', icon: '\u{1F525}' },
  { type: 'century_club', label: 'Century Club', description: '100 total miles', icon: '\u{1F4AF}' },
  { type: 'run_buddy', label: 'Run Buddy', description: 'Used buddy feature 3 times', icon: '\u{1F91D}' },
  { type: 'day_one', label: 'Day One', description: 'Attended a special event', icon: '\u{2B50}' },
  { type: 'both_sides', label: 'Both Sides', description: 'Tuesday + Saturday same week', icon: '\u{1F504}' },
  { type: 'social_butterfly', label: 'Social Butterfly', description: 'Sent 50 messages', icon: '\u{1F98B}' }
];

async function checkAndAwardBadges() {
  if (!currentProfile) return;
  const userId = currentProfile.id;

  // Get existing badges
  const { data: existingBadges } = await supabase
    .from('badges')
    .select('badge_type')
    .eq('user_id', userId);
  const earned = new Set((existingBadges || []).map(b => b.badge_type));

  // Get check-ins
  const checkIns = await getUserCheckIns(userId);
  const stats = { totalCheckIns: checkIns.length, totalMiles: 0, streak: 0 };
  stats.totalMiles = checkIns.reduce((s, c) => s + (c.miles || 0), 0);
  stats.streak = calculateStreak(checkIns);

  const tuesdayCount = checkIns.filter(c => c.event_type === 'weekly_tuesday').length;
  const saturdayCount = checkIns.filter(c => c.event_type === 'weekly_saturday').length;
  const specialCount = checkIns.filter(c => c.event_type === 'special').length;

  // Check for both_sides (same week)
  let hasBothSides = false;
  const weekMap = new Map();
  checkIns.forEach(ci => {
    const weekKey = getWeekStart(new Date(ci.checked_in_at)).toISOString().split('T')[0];
    if (!weekMap.has(weekKey)) weekMap.set(weekKey, new Set());
    weekMap.get(weekKey).add(ci.event_type);
  });
  for (const types of weekMap.values()) {
    if (types.has('weekly_tuesday') && types.has('weekly_saturday')) {
      hasBothSides = true;
      break;
    }
  }

  // Get buddy match count
  const { count: buddyCount } = await supabase
    .from('buddy_requests')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId)
    .not('matched_with', 'is', null);

  // Get message count
  const { count: msgCount } = await supabase
    .from('messages')
    .select('*', { count: 'exact', head: true })
    .eq('user_id', userId);

  // Award badges
  const toAward = [];
  if (!earned.has('first_step') && stats.totalCheckIns >= 1) toAward.push('first_step');
  if (!earned.has('early_bird') && saturdayCount >= 5) toAward.push('early_bird');
  if (!earned.has('night_runner') && tuesdayCount >= 5) toAward.push('night_runner');
  if (!earned.has('streak_week') && stats.streak >= 4) toAward.push('streak_week');
  if (!earned.has('on_fire') && stats.streak >= 12) toAward.push('on_fire');
  if (!earned.has('century_club') && stats.totalMiles >= 100) toAward.push('century_club');
  if (!earned.has('run_buddy') && (buddyCount || 0) >= 3) toAward.push('run_buddy');
  if (!earned.has('day_one') && specialCount >= 1) toAward.push('day_one');
  if (!earned.has('both_sides') && hasBothSides) toAward.push('both_sides');
  if (!earned.has('social_butterfly') && (msgCount || 0) >= 50) toAward.push('social_butterfly');

  for (const badgeType of toAward) {
    await supabase.from('badges').insert({ user_id: userId, badge_type: badgeType });
    const def = BADGE_DEFINITIONS.find(b => b.type === badgeType);
    if (def) showToast(`Badge earned: ${def.icon} ${def.label}!`, 'success');
  }
}

async function getUserBadges(userId) {
  const { data } = await supabase
    .from('badges')
    .select('*')
    .eq('user_id', userId)
    .order('earned_at', { ascending: false });
  return data || [];
}

async function getPinnedBadges(userId) {
  const { data } = await supabase
    .from('pinned_badges')
    .select('*, badges(*)')
    .eq('user_id', userId)
    .order('slot');
  return data || [];
}
```

- [ ] **Step 2: Add miles slider CSS to css/components.css**

Append to `css/components.css`:
```css
/* ===== MILES SLIDER MODAL ===== */
.miles-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: var(--space-md);
}

.miles-modal {
  width: 100%;
  max-width: 340px;
  text-align: center;
}

.miles-options {
  display: flex;
  gap: var(--space-sm);
  justify-content: center;
  flex-wrap: wrap;
}

.miles-btn {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  background: var(--color-surface-hover);
  color: var(--color-text);
  font-family: var(--font-display);
  font-size: 1rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.2s, color 0.2s;
}

.miles-btn:active {
  background: var(--color-primary);
  color: var(--color-bg);
}
```

- [ ] **Step 3: Commit**

```bash
git add js/checkin.js css/components.css
git commit -m "feat: check-in system — time window, miles logging, streak calc, badge engine"
```

---

### Task 6: Home Screen

**Files:**
- Create: `css/home.css`
- Create: `js/home.js`

- [ ] **Step 1: Create css/home.css**

```css
#screen-home {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

/* ===== NEXT RUN CARD ===== */
.next-run-card {
  background: var(--color-surface);
  border-radius: var(--radius-lg);
  padding: var(--space-lg);
  border: 1px solid var(--color-surface-hover);
}

.next-run-label {
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: var(--space-xs);
}

.next-run-title {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  text-transform: uppercase;
  margin-bottom: var(--space-md);
}

.next-run-title span {
  color: var(--color-primary);
}

.countdown {
  display: flex;
  gap: var(--space-md);
  margin-bottom: var(--space-md);
}

.countdown-unit {
  text-align: center;
}

.countdown-value {
  font-family: var(--font-display);
  font-size: 2rem;
  font-weight: 800;
  color: var(--color-primary);
  line-height: 1;
}

.countdown-label {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.next-run-address {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-md);
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.next-run-address a {
  color: var(--color-primary);
  font-weight: 600;
}

.btn-checkin {
  width: 100%;
  padding: var(--space-md);
  font-size: 1.25rem;
}

.btn-checkin.checked {
  background: var(--color-success);
  pointer-events: none;
}

/* ===== STREAK BAR ===== */
.streak-bar {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  display: flex;
  align-items: center;
  gap: var(--space-md);
  cursor: pointer;
}

.streak-info {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.streak-flame {
  font-size: 1.5rem;
}

.streak-count {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--color-secondary);
}

.streak-label {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.streak-dots {
  display: flex;
  gap: 6px;
  margin-left: auto;
}

.streak-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--color-surface-hover);
}

.streak-dot.filled {
  background: var(--color-secondary);
}

/* ===== COMMUNITY HIGHLIGHTS ===== */
.highlights-section h3 {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-sm);
  font-family: var(--font-body);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-weight: 600;
}

.highlights-scroll {
  display: flex;
  gap: var(--space-sm);
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  padding-bottom: var(--space-xs);
}

.highlights-scroll::-webkit-scrollbar { display: none; }

.highlight-card {
  flex-shrink: 0;
  width: 240px;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-md);
  scroll-snap-align: start;
  font-size: 0.875rem;
}

.highlight-card .highlight-icon {
  font-size: 1.25rem;
  margin-bottom: var(--space-xs);
}

.highlight-card .highlight-text {
  color: var(--color-text);
}

.highlight-card .highlight-text strong {
  color: var(--color-primary);
}

/* ===== UPCOMING EVENT PREVIEW ===== */
.upcoming-event-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
}

.upcoming-event-card img {
  width: 100%;
  height: 140px;
  object-fit: cover;
}

.upcoming-event-info {
  padding: var(--space-md);
}

.upcoming-event-info h4 {
  font-family: var(--font-body);
  text-transform: none;
  letter-spacing: normal;
  margin-bottom: var(--space-xs);
}

.upcoming-event-meta {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  display: flex;
  gap: var(--space-md);
}
```

- [ ] **Step 2: Create js/home.js**

```js
// ===== HOME SCREEN =====
let countdownInterval = null;

async function initHome() {
  await refreshHome();
}

async function refreshHome() {
  const container = document.getElementById('screen-home');
  if (!currentProfile) return;

  // Determine next run
  const nextTuesday = getNextRunDate(2);
  const nextSaturday = getNextRunDate(6);
  const nextRun = nextTuesday < nextSaturday ? WEEKLY_RUNS[0] : WEEKLY_RUNS[1];
  const nextRunDate = nextTuesday < nextSaturday ? nextTuesday : nextSaturday;

  // Get user stats
  const stats = await getUserStats(currentProfile.id);

  // Get check-in status for today
  const alreadyCheckedIn = await hasCheckedInToday(nextRun.eventType);
  const windowOpen = isCheckInWindow(nextRunDate);

  // Get last week's check-in count
  const lastCount = await getCheckInCountForEvent(nextRun.eventType, 7);

  // Get upcoming special event
  const { data: upcomingEvents } = await supabase
    .from('special_events')
    .select('*, event_rsvps(count)')
    .gte('event_date', new Date().toISOString())
    .order('event_date')
    .limit(1);

  const upcomingEvent = upcomingEvents?.[0] || null;

  // Get community highlights
  const highlights = await getCommunityHighlights();

  // Render
  let checkInBtnClass = 'btn-primary btn-checkin';
  let checkInBtnText = 'CHECK IN';
  let checkInBtnDisabled = '';

  if (alreadyCheckedIn) {
    checkInBtnClass += ' checked';
    checkInBtnText = '\u2713 CHECKED IN';
    checkInBtnDisabled = 'disabled';
  } else if (!windowOpen) {
    checkInBtnDisabled = 'disabled';
  }

  container.innerHTML = `
    <!-- Next Run Card -->
    <div class="next-run-card">
      <div class="next-run-label">Next Run</div>
      <div class="next-run-title">${nextRun.label} \u2014 <span>${nextRun.location}</span></div>
      <div class="countdown" id="home-countdown"></div>
      <div class="next-run-address">
        \u{1F4CD} ${nextRun.address} \u00B7 <a href="${nextRun.mapsUrl}" target="_blank">Get Directions</a>
      </div>
      <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: var(--space-sm);">
        ${nextRun.time} \u00B7 ${nextRun.distance} \u00B7 ${lastCount} showed up last week
      </div>
      <button class="${checkInBtnClass}" ${checkInBtnDisabled}
        onclick="handleCheckIn('${nextRun.eventType}')">${checkInBtnText}</button>
    </div>

    <!-- Streak Bar -->
    <div class="streak-bar" onclick="navigateTo('stats')">
      <div class="streak-info">
        <span class="streak-flame">\u{1F525}</span>
        <span class="streak-count">${stats.streak}</span>
        <span class="streak-label">Week Streak</span>
      </div>
      <div class="streak-dots">
        ${stats.weekHistory.map(w => `<div class="streak-dot ${w ? 'filled' : ''}"></div>`).join('')}
      </div>
    </div>

    <!-- Community Highlights -->
    ${highlights.length > 0 ? `
    <div class="highlights-section">
      <h3>Community</h3>
      <div class="highlights-scroll">
        ${highlights.map(h => `
          <div class="highlight-card">
            <div class="highlight-icon">${h.icon}</div>
            <div class="highlight-text">${h.text}</div>
          </div>
        `).join('')}
      </div>
    </div>
    ` : ''}

    <!-- Upcoming Special Event -->
    ${upcomingEvent ? `
    <div class="upcoming-event-card" onclick="viewEventDetail('${upcomingEvent.id}')">
      ${upcomingEvent.cover_image_url ? `<img src="${upcomingEvent.cover_image_url}" alt="${upcomingEvent.title}">` : ''}
      <div class="upcoming-event-info">
        <h4>${upcomingEvent.title}</h4>
        <div class="upcoming-event-meta">
          <span>\u{1F4C5} ${formatDate(upcomingEvent.event_date)}</span>
          <span>\u{1F4CD} ${upcomingEvent.location_name}</span>
        </div>
      </div>
    </div>
    ` : ''}
  `;

  // Start countdown timer
  if (countdownInterval) clearInterval(countdownInterval);
  updateCountdown(nextRunDate);
  countdownInterval = setInterval(() => updateCountdown(nextRunDate), 60000);
}

function updateCountdown(targetDate) {
  const el = document.getElementById('home-countdown');
  if (!el) return;
  const cd = formatCountdown(targetDate);

  if (cd.active) {
    el.innerHTML = `
      <div class="countdown-unit">
        <div class="countdown-value" style="color: var(--color-success);">LIVE</div>
        <div class="countdown-label">Now</div>
      </div>
    `;
  } else {
    el.innerHTML = `
      <div class="countdown-unit">
        <div class="countdown-value">${cd.days}</div>
        <div class="countdown-label">Days</div>
      </div>
      <div class="countdown-unit">
        <div class="countdown-value">${cd.hours}</div>
        <div class="countdown-label">Hours</div>
      </div>
      <div class="countdown-unit">
        <div class="countdown-value">${cd.minutes}</div>
        <div class="countdown-label">Min</div>
      </div>
    `;
  }
}

async function handleCheckIn(eventType) {
  const result = await checkIn(eventType);
  if (result) {
    showMilesSlider(result.id);
    await refreshHome();
  }
}

async function getCommunityHighlights() {
  const highlights = [];

  // Recent check-in counts
  const tuesdayCount = await getCheckInCountForEvent('weekly_tuesday', 7);
  const saturdayCount = await getCheckInCountForEvent('weekly_saturday', 7);

  if (tuesdayCount > 0) {
    highlights.push({
      icon: '\u{1F303}',
      text: `<strong>${tuesdayCount}</strong> checked in at Deep Ellum this week`
    });
  }

  if (saturdayCount > 0) {
    highlights.push({
      icon: '\u{1F305}',
      text: `<strong>${saturdayCount}</strong> showed up at Fair Oaks this week`
    });
  }

  // Recent badges earned (by anyone)
  const { data: recentBadges } = await supabase
    .from('badges')
    .select('badge_type, users(display_name)')
    .order('earned_at', { ascending: false })
    .limit(3);

  if (recentBadges) {
    recentBadges.forEach(b => {
      const def = BADGE_DEFINITIONS.find(d => d.type === b.badge_type);
      if (def && b.users) {
        highlights.push({
          icon: def.icon,
          text: `<strong>${b.users.display_name}</strong> earned ${def.label}`
        });
      }
    });
  }

  return highlights;
}
```

- [ ] **Step 3: Test Home screen**

- Sign in → verify Home screen renders
- Verify countdown timer shows correct time to next run
- Verify streak bar shows (will be 0 for new user)
- Verify check-in button state (disabled if outside window)
- If inside check-in window: tap check-in, verify miles slider appears, verify toast notification

- [ ] **Step 4: Commit**

```bash
git add css/home.css js/home.js
git commit -m "feat: Home screen — next run countdown, check-in, streak bar, community highlights"
```

---

### Task 7: Events Screen

**Files:**
- Create: `css/events.css`
- Create: `js/events.js`

- [ ] **Step 1: Create css/events.css**

```css
#screen-events {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

/* ===== SECTION HEADERS ===== */
.events-section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.events-section-header h2 {
  font-size: 1.25rem;
}

/* ===== WEEKLY RUN CARDS ===== */
.weekly-runs {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.weekly-run-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.weekly-run-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-sm);
}

.weekly-run-day {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 800;
  text-transform: uppercase;
}

.weekly-run-time {
  font-size: 0.875rem;
  color: var(--color-primary);
  font-weight: 600;
}

.weekly-run-details {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-sm);
}

.weekly-run-details a { color: var(--color-primary); }

.weekly-run-stats {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-md);
}

.weekly-run-actions {
  display: flex;
  gap: var(--space-sm);
}

.weekly-run-actions .btn-primary { flex: 1; }

.btn-buddy {
  display: flex;
  align-items: center;
  gap: var(--space-xs);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface-hover);
  border-radius: var(--radius-md);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-secondary);
  white-space: nowrap;
}

.buddy-count {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  margin-top: var(--space-xs);
}

/* ===== CALENDAR TOGGLE ===== */
.calendar-toggle {
  display: flex;
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: 2px;
}

.calendar-toggle button {
  flex: 1;
  padding: var(--space-sm);
  border-radius: var(--radius-sm);
  font-size: 0.75rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  transition: background 0.2s, color 0.2s;
}

.calendar-toggle button.active {
  background: var(--color-primary);
  color: var(--color-bg);
}

/* ===== SPECIAL EVENT CARDS ===== */
.special-events {
  display: flex;
  flex-direction: column;
  gap: var(--space-md);
}

.special-event-card {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  overflow: hidden;
  cursor: pointer;
}

.special-event-card img {
  width: 100%;
  height: 160px;
  object-fit: cover;
}

.special-event-body {
  padding: var(--space-md);
}

.special-event-body h3 {
  font-family: var(--font-body);
  text-transform: none;
  letter-spacing: normal;
  font-size: 1.125rem;
  margin-bottom: var(--space-xs);
}

.special-event-meta {
  display: flex;
  flex-wrap: wrap;
  gap: var(--space-sm) var(--space-md);
  font-size: 0.75rem;
  color: var(--color-text-muted);
  margin-bottom: var(--space-md);
}

.special-event-actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.rsvp-count {
  font-size: 0.875rem;
  color: var(--color-text-muted);
}

.rsvp-count strong {
  color: var(--color-secondary);
}

/* ===== MINI CALENDAR ===== */
.mini-calendar {
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-md);
}

.calendar-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: var(--space-md);
}

.calendar-header h3 {
  font-size: 1rem;
  font-family: var(--font-body);
  text-transform: none;
}

.calendar-nav {
  display: flex;
  gap: var(--space-sm);
}

.calendar-nav button {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: var(--radius-full);
  background: var(--color-surface-hover);
  font-size: 1rem;
  color: var(--color-text);
}

.calendar-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 2px;
  text-align: center;
}

.calendar-day-label {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  padding: var(--space-xs) 0;
}

.calendar-day {
  aspect-ratio: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  border-radius: var(--radius-sm);
  position: relative;
  color: var(--color-text-muted);
}

.calendar-day.today {
  color: var(--color-text);
  font-weight: 700;
}

.calendar-day .cal-dot {
  position: absolute;
  bottom: 2px;
  width: 4px;
  height: 4px;
  border-radius: 50%;
}

.cal-dot.weekly { background: var(--color-primary); }
.cal-dot.special { background: var(--color-secondary); }
```

- [ ] **Step 2: Create js/events.js**

```js
// ===== EVENTS SCREEN =====
let eventsView = 'list'; // 'list' or 'calendar'
let calendarMonth = new Date().getMonth();
let calendarYear = new Date().getFullYear();

async function initEvents() {
  await refreshEvents();
}

async function refreshEvents() {
  const container = document.getElementById('screen-events');
  if (!currentProfile) return;

  // Get weekly run stats
  const tuesdayCount = await getCheckInCountForEvent('weekly_tuesday', 7);
  const saturdayCount = await getCheckInCountForEvent('weekly_saturday', 7);

  // Get buddy counts for next runs
  const nextTuesdayDate = getNextRunDate(2).toISOString().split('T')[0];
  const nextSaturdayDate = getNextRunDate(6).toISOString().split('T')[0];

  const { count: tuesdayBuddies } = await supabase
    .from('buddy_requests')
    .select('*', { count: 'exact', head: true })
    .eq('run_day', 'tuesday')
    .eq('run_date', nextTuesdayDate)
    .is('matched_with', null);

  const { count: saturdayBuddies } = await supabase
    .from('buddy_requests')
    .select('*', { count: 'exact', head: true })
    .eq('run_day', 'saturday')
    .eq('run_date', nextSaturdayDate)
    .is('matched_with', null);

  // Get check-in status
  const tuesdayChecked = await hasCheckedInToday('weekly_tuesday');
  const saturdayChecked = await hasCheckedInToday('weekly_saturday');

  // Get special events
  const { data: specialEvents } = await supabase
    .from('special_events')
    .select('*')
    .order('event_date');

  const now = new Date();
  const upcoming = (specialEvents || []).filter(e => new Date(e.event_date) >= now);
  const past = (specialEvents || []).filter(e => new Date(e.event_date) < now);

  // Get RSVP counts
  const rsvpCounts = {};
  if (specialEvents?.length) {
    const { data: rsvps } = await supabase
      .from('event_rsvps')
      .select('event_id')
      .in('event_id', specialEvents.map(e => e.id));
    (rsvps || []).forEach(r => {
      rsvpCounts[r.event_id] = (rsvpCounts[r.event_id] || 0) + 1;
    });
  }

  container.innerHTML = `
    <!-- Weekly Runs -->
    <div>
      <div class="events-section-header">
        <h2>Weekly Runs</h2>
      </div>
      <div class="weekly-runs">
        ${renderWeeklyRunCard(WEEKLY_RUNS[0], tuesdayCount, tuesdayBuddies || 0, tuesdayChecked, nextTuesdayDate)}
        ${renderWeeklyRunCard(WEEKLY_RUNS[1], saturdayCount, saturdayBuddies || 0, saturdayChecked, nextSaturdayDate)}
      </div>
    </div>

    <!-- Special Events -->
    <div>
      <div class="events-section-header">
        <h2>Special Events</h2>
        <div class="calendar-toggle">
          <button class="${eventsView === 'list' ? 'active' : ''}" onclick="setEventsView('list')">List</button>
          <button class="${eventsView === 'calendar' ? 'active' : ''}" onclick="setEventsView('calendar')">Calendar</button>
        </div>
      </div>

      ${eventsView === 'list' ? `
        <div class="special-events">
          ${upcoming.length === 0 && past.length === 0 ? `
            <div class="empty-state">
              <p>No events yet. Stay tuned!</p>
            </div>
          ` : ''}
          ${upcoming.map(e => renderSpecialEventCard(e, rsvpCounts[e.id] || 0, false)).join('')}
          ${past.length > 0 ? `
            <h3 style="color: var(--color-text-muted); font-size: 0.875rem; font-family: var(--font-body); text-transform: uppercase; letter-spacing: 0.1em; margin-top: var(--space-sm);">Past Events</h3>
            ${past.map(e => renderSpecialEventCard(e, rsvpCounts[e.id] || 0, true)).join('')}
          ` : ''}
        </div>
      ` : renderCalendarView(specialEvents || [])}
    </div>
  `;
}

function renderWeeklyRunCard(run, lastCount, buddyCount, checkedIn, nextDate) {
  const nextRunDate = getNextRunDate(run.dayOfWeek);
  const windowOpen = isCheckInWindow(nextRunDate);

  let btnHtml = '';
  if (checkedIn) {
    btnHtml = `<button class="btn-primary btn-sm checked" disabled>\u2713 Checked In</button>`;
  } else if (windowOpen) {
    btnHtml = `<button class="btn-primary btn-sm" onclick="handleCheckIn('${run.eventType}')">Check In</button>`;
  } else {
    btnHtml = `<button class="btn-primary btn-sm" disabled>Check In</button>`;
  }

  return `
    <div class="weekly-run-card">
      <div class="weekly-run-header">
        <span class="weekly-run-day">${run.label}</span>
        <span class="weekly-run-time">${run.time}</span>
      </div>
      <div class="weekly-run-details">
        \u{1F4CD} ${run.location} \u00B7 ${run.distance} \u00B7 <a href="${run.mapsUrl}" target="_blank">Directions</a>
      </div>
      <div class="weekly-run-stats">${lastCount} showed up last week</div>
      <div class="weekly-run-actions">
        ${btnHtml}
        <button class="btn-buddy" onclick="openBuddyBoard('${run.day}', '${nextDate}')">
          \u{1F91D} Looking for a buddy?
        </button>
      </div>
      ${buddyCount > 0 ? `<div class="buddy-count">${buddyCount} looking for a buddy</div>` : ''}
    </div>
  `;
}

function renderSpecialEventCard(event, rsvpCount, isPast) {
  return `
    <div class="special-event-card" onclick="viewEventDetail('${event.id}')">
      ${event.cover_image_url ? `<img src="${event.cover_image_url}" alt="${event.title}">` : ''}
      <div class="special-event-body">
        <h3>${event.title}</h3>
        <div class="special-event-meta">
          <span>\u{1F4C5} ${formatDate(event.event_date)} \u00B7 ${formatTime(event.event_date)}</span>
          <span>\u{1F4CD} ${event.location_name}</span>
        </div>
        <div class="special-event-actions">
          <div class="rsvp-count"><strong>${rsvpCount}</strong> going</div>
          ${!isPast ? `<button class="btn-primary btn-sm btn-orange" onclick="event.stopPropagation(); toggleRSVP('${event.id}')">RSVP</button>` : `<span style="font-size: 0.75rem; color: var(--color-text-muted);">Event ended</span>`}
        </div>
      </div>
    </div>
  `;
}

function renderCalendarView(events) {
  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];
  const dayLabels = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

  const firstDay = new Date(calendarYear, calendarMonth, 1);
  const lastDay = new Date(calendarYear, calendarMonth + 1, 0);
  let startDay = firstDay.getDay() - 1;
  if (startDay < 0) startDay = 6; // Monday = 0

  const today = new Date();

  let daysHtml = dayLabels.map(d => `<div class="calendar-day-label">${d}</div>`).join('');

  // Empty cells for days before month starts
  for (let i = 0; i < startDay; i++) {
    daysHtml += `<div class="calendar-day"></div>`;
  }

  for (let day = 1; day <= lastDay.getDate(); day++) {
    const date = new Date(calendarYear, calendarMonth, day);
    const dow = date.getDay();
    const isToday = date.toDateString() === today.toDateString();
    const isTuesday = dow === 2;
    const isSaturday = dow === 6;
    const hasSpecialEvent = events.some(e => new Date(e.event_date).toDateString() === date.toDateString());

    let dotHtml = '';
    if (isTuesday || isSaturday) dotHtml += `<div class="cal-dot weekly"></div>`;
    if (hasSpecialEvent) dotHtml += `<div class="cal-dot special" style="left: calc(50% + 4px);"></div>`;

    daysHtml += `<div class="calendar-day ${isToday ? 'today' : ''}">${day}${dotHtml}</div>`;
  }

  return `
    <div class="mini-calendar">
      <div class="calendar-header">
        <h3>${monthNames[calendarMonth]} ${calendarYear}</h3>
        <div class="calendar-nav">
          <button onclick="changeCalendarMonth(-1)">\u2039</button>
          <button onclick="changeCalendarMonth(1)">\u203A</button>
        </div>
      </div>
      <div class="calendar-grid">${daysHtml}</div>
    </div>
  `;
}

function setEventsView(view) {
  eventsView = view;
  refreshEvents();
}

function changeCalendarMonth(delta) {
  calendarMonth += delta;
  if (calendarMonth > 11) { calendarMonth = 0; calendarYear++; }
  if (calendarMonth < 0) { calendarMonth = 11; calendarYear--; }
  refreshEvents();
}

async function toggleRSVP(eventId) {
  if (!currentProfile) return;

  const { data: existing } = await supabase
    .from('event_rsvps')
    .select('id')
    .eq('event_id', eventId)
    .eq('user_id', currentProfile.id)
    .maybeSingle();

  if (existing) {
    await supabase.from('event_rsvps').delete().eq('id', existing.id);
    showToast('RSVP removed', 'info');
  } else {
    await supabase.from('event_rsvps').insert({
      event_id: eventId,
      user_id: currentProfile.id
    });
    showToast("You're going! See you there!", 'success');
  }

  refreshEvents();
}

async function viewEventDetail(eventId) {
  const { data: event } = await supabase
    .from('special_events')
    .select('*')
    .eq('id', eventId)
    .single();

  if (!event) return;

  const { data: rsvps } = await supabase
    .from('event_rsvps')
    .select('user_id, users(display_name, avatar_url)')
    .eq('event_id', eventId);

  const { data: photos } = await supabase
    .from('event_photos')
    .select('*')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  const isPast = new Date(event.event_date) < new Date();
  const userRsvp = (rsvps || []).find(r => r.user_id === currentProfile?.id);

  const container = document.getElementById('screen-event-detail');
  container.innerHTML = `
    <button class="auth-back" onclick="navigateTo('events')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Events
    </button>
    ${event.cover_image_url ? `<img src="${event.cover_image_url}" alt="${event.title}" style="width: 100%; height: 200px; object-fit: cover; border-radius: var(--radius-md); margin-bottom: var(--space-md);">` : ''}
    <h2 style="margin-bottom: var(--space-sm);">${event.title}</h2>
    <div style="font-size: 0.875rem; color: var(--color-text-muted); margin-bottom: var(--space-md);">
      \u{1F4C5} ${formatDate(event.event_date)} \u00B7 ${formatTime(event.event_date)}<br>
      \u{1F4CD} ${event.location_name} \u2014 ${event.location_address}
      <br><a href="https://maps.google.com/?q=${encodeURIComponent(event.location_address)}" target="_blank" style="color: var(--color-primary);">Get Directions</a>
    </div>
    ${event.description ? `<p style="margin-bottom: var(--space-lg);">${event.description}</p>` : ''}

    ${!isPast ? `
      <button class="btn-primary ${userRsvp ? 'btn-orange' : ''}" onclick="toggleRSVP('${event.id}'); viewEventDetail('${event.id}');">
        ${userRsvp ? "Cancel RSVP" : "RSVP \u2014 I'm Going!"}
      </button>
    ` : ''}

    <div style="margin-top: var(--space-lg);">
      <h3 style="font-size: 0.875rem; font-family: var(--font-body); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-sm);">
        ${(rsvps || []).length} Going
      </h3>
      <div style="display: flex; flex-wrap: wrap; gap: var(--space-sm);">
        ${(rsvps || []).map(r => `
          <div style="display: flex; align-items: center; gap: var(--space-xs); background: var(--color-surface); padding: 4px 8px; border-radius: var(--radius-full); font-size: 0.75rem;">
            <img src="${r.users?.avatar_url || ''}" class="avatar-sm" style="width: 20px; height: 20px;" alt="">
            ${r.users?.display_name || 'Member'}
          </div>
        `).join('')}
      </div>
    </div>

    ${isPast && (photos || []).length > 0 ? `
      <div style="margin-top: var(--space-lg);">
        <h3 style="font-size: 0.875rem; font-family: var(--font-body); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-sm);">
          Photos
        </h3>
        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: var(--space-xs);">
          ${(photos || []).map(p => `<img src="${p.photo_url}" style="width: 100%; aspect-ratio: 1; object-fit: cover; border-radius: var(--radius-sm);">`).join('')}
        </div>
      </div>
    ` : ''}
  `;

  navigateToSub('event-detail');
}
```

- [ ] **Step 3: Commit**

```bash
git add css/events.css js/events.js
git commit -m "feat: Events screen — weekly runs, special events, RSVP, calendar toggle, event detail"
```

---

### Task 8: Run Buddy Feature

**Files:**
- Create: `js/buddy.js`

- [ ] **Step 1: Create js/buddy.js**

```js
// ===== RUN BUDDY FEATURE =====

async function openBuddyBoard(runDay, runDate) {
  const container = document.getElementById('screen-buddy-board');

  // Get buddy requests for this run
  const { data: requests } = await supabase
    .from('buddy_requests')
    .select('*, users(display_name, avatar_url, pace_group)')
    .eq('run_day', runDay)
    .eq('run_date', runDate)
    .order('created_at', { ascending: false });

  // Check if current user already has a request
  const myRequest = (requests || []).find(r => r.user_id === currentProfile.id);

  // Sort: same pace group first
  const sorted = [...(requests || [])].sort((a, b) => {
    const aMatch = a.users?.pace_group === currentProfile.pace_group ? 0 : 1;
    const bMatch = b.users?.pace_group === currentProfile.pace_group ? 0 : 1;
    return aMatch - bMatch;
  });

  const dayLabel = runDay === 'tuesday' ? 'Tuesday — Deep Ellum' : 'Saturday — Fair Oaks';

  container.innerHTML = `
    <button class="auth-back" onclick="navigateTo('events')">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Events
    </button>

    <h2 style="margin-bottom: var(--space-xs);">Run Buddies</h2>
    <p style="margin-bottom: var(--space-lg);">${dayLabel} \u00B7 ${formatDate(runDate)}</p>

    ${!myRequest ? `
      <div class="card" style="margin-bottom: var(--space-lg);">
        <h3 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal; font-size: 1rem; margin-bottom: var(--space-sm);">Looking for someone to run with?</h3>
        <div class="form-group">
          <input class="form-input" type="text" id="buddy-intro" placeholder="e.g. First time here, a little nervous!" maxlength="100">
        </div>
        <button class="btn-primary" onclick="createBuddyRequest('${runDay}', '${runDate}')">
          \u{1F91D} Add Me to the Board
        </button>
      </div>
    ` : `
      <div class="card" style="margin-bottom: var(--space-lg); border: 1px solid var(--color-primary);">
        <p style="color: var(--color-primary); font-weight: 600;">\u2713 You're on the board!</p>
        ${myRequest.matched_with ? `<p style="font-size: 0.875rem; margin-top: var(--space-xs);">Matched with a buddy — see you there!</p>` : `<p style="font-size: 0.875rem; color: var(--color-text-muted); margin-top: var(--space-xs);">Waiting for a match...</p>`}
      </div>
    `}

    <div style="display: flex; flex-direction: column; gap: var(--space-sm);">
      ${sorted.filter(r => r.user_id !== currentProfile.id).map(r => `
        <div class="card" style="display: flex; align-items: flex-start; gap: var(--space-md); ${r.matched_with ? 'opacity: 0.5;' : ''}">
          <img src="${r.users?.avatar_url || ''}" class="avatar-md" alt="${r.users?.display_name}">
          <div style="flex: 1;">
            <div style="display: flex; align-items: center; gap: var(--space-sm); margin-bottom: 2px;">
              <strong style="font-size: 0.875rem;">${r.users?.display_name || 'Member'}</strong>
              ${paceGroupBadgeHTML(r.users?.pace_group)}
            </div>
            ${r.intro_line ? `<p style="font-size: 0.875rem; margin-bottom: var(--space-sm);">${escapeHtml(r.intro_line)}</p>` : ''}
            ${r.matched_with ? `
              <span style="font-size: 0.75rem; color: var(--color-success);">\u2713 Matched</span>
            ` : `
              <button class="btn-primary btn-sm" onclick="matchWithBuddy('${r.id}', '${r.user_id}', '${runDay}', '${runDate}')">
                Run Together
              </button>
            `}
          </div>
        </div>
      `).join('')}

      ${sorted.filter(r => r.user_id !== currentProfile.id).length === 0 ? `
        <div class="empty-state">
          <p>No one else is looking for a buddy yet. Be the first!</p>
        </div>
      ` : ''}
    </div>
  `;

  navigateToSub('buddy-board');

  // Subscribe to realtime updates
  supabase
    .channel(`buddy-${runDay}-${runDate}`)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'buddy_requests',
      filter: `run_day=eq.${runDay}` }, () => {
      openBuddyBoard(runDay, runDate);
    })
    .subscribe();
}

async function createBuddyRequest(runDay, runDate) {
  const introLine = document.getElementById('buddy-intro')?.value.trim() || null;

  try {
    await supabase.from('buddy_requests').insert({
      user_id: currentProfile.id,
      run_day: runDay,
      run_date: runDate,
      intro_line: introLine
    });
    showToast("You're on the board! We'll notify you when someone matches.", 'success');
    openBuddyBoard(runDay, runDate);
  } catch (err) {
    showToast('Failed to add buddy request', 'error');
  }
}

async function matchWithBuddy(requestId, otherUserId, runDay, runDate) {
  try {
    // Update the other person's request
    await supabase.from('buddy_requests').update({
      matched_with: currentProfile.id
    }).eq('id', requestId);

    // Create our own request if we don't have one, and mark matched
    const { data: myRequest } = await supabase
      .from('buddy_requests')
      .select('id')
      .eq('user_id', currentProfile.id)
      .eq('run_day', runDay)
      .eq('run_date', runDate)
      .maybeSingle();

    if (myRequest) {
      await supabase.from('buddy_requests').update({
        matched_with: otherUserId
      }).eq('id', myRequest.id);
    } else {
      await supabase.from('buddy_requests').insert({
        user_id: currentProfile.id,
        run_day: runDay,
        run_date: runDate,
        matched_with: otherUserId
      });
    }

    // Get the other user's name
    const otherUser = await getUserProfile(otherUserId);
    const dayLabel = runDay === 'tuesday' ? 'Tuesday at Deep Ellum' : 'Saturday at Fair Oaks';
    showToast(`You and ${otherUser.display_name} are running together ${dayLabel}!`, 'success');

    openBuddyBoard(runDay, runDate);
  } catch (err) {
    showToast('Match failed. Try again.', 'error');
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
```

- [ ] **Step 2: Commit**

```bash
git add js/buddy.js
git commit -m "feat: Run Buddy — buddy board, matching, realtime updates, pace group sorting"
```

---

### PHASE 2 REVIEW GATE

**STOP.** Run the mandatory 4-agent senior review panel before proceeding to Phase 3.

Deploy all 4 reviewers in a single agent dispatch:
1. **Senior App Developer** — test check-in flow, verify streak calculation, test buddy matching concurrency, check for SQL injection via intro_line, verify RLS prevents cross-user check-ins, test countdown timer accuracy
2. **Senior Art Director** — review Home screen visual hierarchy (hero card → streak → highlights), check card spacing consistency, verify countdown typography, review buddy board layout, check calendar dot visibility
3. **Senior Marketing Strategist** — review all user-facing copy (check-in confirmation, badge names, buddy prompts, empty states), check if language is hype/inclusive enough for RIU culture, evaluate "Looking for a buddy?" CTA placement
4. **Senior UX Designer** — test check-in button state transitions, verify miles slider touch targets, test buddy board flow (add → wait → match), review calendar interaction, check scroll performance on highlights

Fix ALL issues before proceeding.

---

## Phase 3: Community Chat

### Task 9: Community Screen (Channel List + Chat)

**Files:**
- Create: `css/community.css`
- Create: `js/community.js`

- [ ] **Step 1: Create css/community.css**

```css
/* ===== CHANNEL LIST ===== */
#screen-community {
  padding: 0 !important;
}

.channel-list-header {
  padding: var(--space-md);
  padding-bottom: var(--space-sm);
}

.channel-list {
  display: flex;
  flex-direction: column;
}

.channel-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-surface);
  cursor: pointer;
  transition: background 0.15s;
}

.channel-item:active { background: var(--color-surface); }

.channel-icon {
  width: 44px;
  height: 44px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.25rem;
  flex-shrink: 0;
}

.channel-info {
  flex: 1;
  min-width: 0;
}

.channel-name {
  font-weight: 600;
  font-size: 0.875rem;
  margin-bottom: 2px;
}

.channel-preview {
  font-size: 0.75rem;
  color: var(--color-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.channel-meta {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 4px;
  flex-shrink: 0;
}

.channel-time {
  font-size: 0.625rem;
  color: var(--color-text-muted);
}

.channel-unread {
  min-width: 18px;
  height: 18px;
  padding: 0 5px;
  background: var(--color-primary);
  color: var(--color-bg);
  font-size: 10px;
  font-weight: 700;
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
}

/* ===== CHAT VIEW ===== */
#screen-chat {
  display: flex;
  flex-direction: column;
  padding: 0 !important;
}

.chat-header {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-md);
  border-bottom: 1px solid var(--color-surface);
  flex-shrink: 0;
}

.chat-header h3 {
  font-family: var(--font-body);
  text-transform: none;
  letter-spacing: normal;
  font-size: 1rem;
}

.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: var(--space-md);
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
}

/* Pinned message */
.pinned-message {
  background: rgba(191, 255, 0, 0.08);
  border: 1px solid rgba(191, 255, 0, 0.2);
  border-radius: var(--radius-md);
  padding: var(--space-sm) var(--space-md);
  font-size: 0.75rem;
  margin-bottom: var(--space-sm);
  display: flex;
  align-items: center;
  gap: var(--space-sm);
}

.pinned-message .pin-icon {
  color: var(--color-primary);
  font-size: 0.875rem;
}

/* Message bubbles */
.message-row {
  display: flex;
  gap: var(--space-sm);
  max-width: 85%;
}

.message-row.mine {
  align-self: flex-end;
  flex-direction: row-reverse;
}

.message-avatar {
  flex-shrink: 0;
  align-self: flex-end;
}

.message-bubble {
  padding: var(--space-sm) var(--space-md);
  border-radius: var(--radius-md);
  font-size: 0.875rem;
  line-height: 1.4;
  word-break: break-word;
}

.message-row:not(.mine) .message-bubble {
  background: var(--color-surface);
  border-bottom-left-radius: 4px;
}

.message-row.mine .message-bubble {
  background: var(--color-primary);
  color: var(--color-bg);
  border-bottom-right-radius: 4px;
}

.message-sender {
  font-size: 0.625rem;
  font-weight: 600;
  color: var(--color-text-muted);
  margin-bottom: 2px;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.message-row.mine .message-sender { display: none; }

.message-time {
  font-size: 0.5rem;
  color: var(--color-text-muted);
  margin-top: 2px;
}

.message-row.mine .message-time { text-align: right; }

.message-image {
  max-width: 200px;
  border-radius: var(--radius-sm);
  margin-top: var(--space-xs);
  cursor: pointer;
}

/* Chat input */
.chat-input-bar {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  padding: var(--space-sm) var(--space-md);
  padding-bottom: calc(var(--space-sm) + var(--safe-area-bottom));
  border-top: 1px solid var(--color-surface);
  background: var(--color-bg);
  flex-shrink: 0;
}

.chat-input {
  flex: 1;
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface);
  border: none;
  border-radius: var(--radius-full);
  color: var(--color-text);
  font-size: 0.875rem;
  outline: none;
}

.chat-input::placeholder { color: var(--color-text-muted); }

.chat-send-btn {
  width: 36px;
  height: 36px;
  border-radius: var(--radius-full);
  background: var(--color-primary);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-send-btn svg {
  width: 18px;
  height: 18px;
  fill: var(--color-bg);
}

.chat-photo-btn {
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.chat-photo-btn svg {
  width: 20px;
  height: 20px;
  fill: var(--color-text-muted);
}
```

- [ ] **Step 2: Create js/community.js**

```js
// ===== COMMUNITY / GROUP CHAT =====
let activeChannelId = null;
let activeChannelName = null;
let chatSubscription = null;
let lastReadTimestamps = {};

const CHANNEL_ICONS = {
  'tuesday-deep-ellum': '\u{1F303}',
  'saturday-fair-oaks': '\u{1F305}',
  'trail-runs': '\u{26F0}',
  'walk-it-up': '\u{1F6B6}',
  'jog-it-up': '\u{1F3C3}',
  'run-it-up': '\u{1F525}',
  'sprint-it-up': '\u{26A1}',
  'general': '\u{1F4AC}',
  'newbies': '\u{1F44B}',
  'post-run-pics': '\u{1F4F8}',
  'fit-check': '\u{1F457}'
};

async function initCommunity() {
  // Load last-read timestamps from localStorage
  try {
    lastReadTimestamps = JSON.parse(localStorage.getItem('riu_last_read') || '{}');
  } catch { lastReadTimestamps = {}; }

  await refreshCommunity();
}

async function refreshCommunity() {
  const container = document.getElementById('screen-community');
  if (!currentProfile) return;

  // Get user's channels
  const { data: memberships } = await supabase
    .from('channel_members')
    .select('channel_id, channels(id, name, type, description)')
    .eq('user_id', currentProfile.id);

  const channels = (memberships || []).map(m => m.channels).filter(Boolean);

  // Get last message for each channel
  const channelData = await Promise.all(channels.map(async (ch) => {
    const { data: lastMsg } = await supabase
      .from('messages')
      .select('content, created_at, users(display_name)')
      .eq('channel_id', ch.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    // Count unread
    const lastRead = lastReadTimestamps[ch.id] || '1970-01-01';
    const { count: unread } = await supabase
      .from('messages')
      .select('*', { count: 'exact', head: true })
      .eq('channel_id', ch.id)
      .gt('created_at', lastRead);

    return { ...ch, lastMsg, unread: unread || 0 };
  }));

  // Sort: channels with unread first, then by last message time
  channelData.sort((a, b) => {
    if (a.unread && !b.unread) return -1;
    if (!a.unread && b.unread) return 1;
    const aTime = a.lastMsg?.created_at || a.created_at || '';
    const bTime = b.lastMsg?.created_at || b.created_at || '';
    return bTime.localeCompare(aTime);
  });

  // Update community tab badge
  const totalUnread = channelData.reduce((sum, ch) => sum + ch.unread, 0);
  const communityBadge = document.getElementById('community-badge');
  if (communityBadge) {
    if (totalUnread > 0) {
      communityBadge.textContent = totalUnread > 99 ? '99+' : totalUnread;
      communityBadge.classList.remove('hidden');
    } else {
      communityBadge.classList.add('hidden');
    }
  }

  container.innerHTML = `
    <div class="channel-list-header">
      <h2>Community</h2>
    </div>
    <div class="channel-list">
      ${channelData.map(ch => `
        <div class="channel-item" onclick="openChat('${ch.id}', '${ch.name}')">
          <div class="channel-icon">${CHANNEL_ICONS[ch.name] || '\u{1F4AC}'}</div>
          <div class="channel-info">
            <div class="channel-name">#${ch.name}</div>
            <div class="channel-preview">${ch.lastMsg ? `${ch.lastMsg.users?.display_name || 'Someone'}: ${ch.lastMsg.content}` : ch.description || 'No messages yet'}</div>
          </div>
          <div class="channel-meta">
            ${ch.lastMsg ? `<span class="channel-time">${formatRelativeTime(ch.lastMsg.created_at)}</span>` : ''}
            ${ch.unread > 0 ? `<span class="channel-unread">${ch.unread}</span>` : ''}
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

async function openChat(channelId, channelName) {
  activeChannelId = channelId;
  activeChannelName = channelName;

  // Mark as read
  lastReadTimestamps[channelId] = new Date().toISOString();
  localStorage.setItem('riu_last_read', JSON.stringify(lastReadTimestamps));

  const container = document.getElementById('screen-chat');

  container.innerHTML = `
    <div class="chat-header">
      <button class="icon-btn" onclick="closeChat()" aria-label="Back">
        <svg class="icon" viewBox="0 0 24 24"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </button>
      <h3>#${channelName}</h3>
    </div>
    <div class="chat-messages" id="chat-messages">
      <div class="loading-screen"><div class="spinner"></div></div>
    </div>
    <div class="chat-input-bar">
      <label class="chat-photo-btn" for="chat-photo-input">
        <svg viewBox="0 0 24 24"><path d="M21 19V5c0-1.1-.9-2-2-2H5c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2zM8.5 13.5l2.5 3.01L14.5 12l4.5 6H5l3.5-4.5z"/></svg>
        <input type="file" id="chat-photo-input" accept="image/*" class="hidden" onchange="handleChatPhoto(event)">
      </label>
      <input class="chat-input" type="text" id="chat-input" placeholder="Message #${channelName}" autocomplete="off"
        onkeydown="if(event.key==='Enter')sendMessage()">
      <button class="chat-send-btn" onclick="sendMessage()" aria-label="Send">
        <svg viewBox="0 0 24 24"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
      </button>
    </div>
  `;

  navigateToSub('chat');

  // Load messages
  await loadMessages();

  // Subscribe to realtime
  if (chatSubscription) {
    supabase.removeChannel(chatSubscription);
  }

  chatSubscription = supabase
    .channel(`chat-${channelId}`)
    .on('postgres_changes', {
      event: 'INSERT',
      schema: 'public',
      table: 'messages',
      filter: `channel_id=eq.${channelId}`
    }, async (payload) => {
      await appendMessage(payload.new);
      scrollToBottom();
      // Update last read
      lastReadTimestamps[channelId] = new Date().toISOString();
      localStorage.setItem('riu_last_read', JSON.stringify(lastReadTimestamps));
    })
    .subscribe();
}

async function loadMessages() {
  const msgContainer = document.getElementById('chat-messages');
  if (!msgContainer || !activeChannelId) return;

  // Get pinned messages
  const { data: pinned } = await supabase
    .from('messages')
    .select('*, users(display_name)')
    .eq('channel_id', activeChannelId)
    .eq('is_pinned', true)
    .order('created_at', { ascending: false })
    .limit(1);

  // Get recent messages
  const { data: messages } = await supabase
    .from('messages')
    .select('*, users(display_name, avatar_url, pace_group)')
    .eq('channel_id', activeChannelId)
    .order('created_at', { ascending: false })
    .limit(50);

  const reversed = (messages || []).reverse();

  let html = '';

  // Pinned message
  if (pinned?.[0]) {
    html += `
      <div class="pinned-message">
        <span class="pin-icon">\u{1F4CC}</span>
        <span><strong>${pinned[0].users?.display_name}:</strong> ${escapeHtml(pinned[0].content)}</span>
      </div>
    `;
  }

  // Messages
  html += reversed.map(m => renderMessage(m)).join('');

  msgContainer.innerHTML = html;
  scrollToBottom();
}

function renderMessage(msg) {
  const isMine = msg.user_id === currentProfile?.id;

  return `
    <div class="message-row ${isMine ? 'mine' : ''}">
      <img src="${msg.users?.avatar_url || ''}" class="avatar-sm message-avatar" alt="">
      <div>
        <div class="message-sender">
          ${msg.users?.display_name || 'Member'}
          ${paceGroupBadgeHTML(msg.users?.pace_group)}
        </div>
        <div class="message-bubble">
          ${escapeHtml(msg.content)}
          ${msg.image_url ? `<img src="${msg.image_url}" class="message-image" alt="Shared photo">` : ''}
        </div>
        <div class="message-time">${formatRelativeTime(msg.created_at)}</div>
      </div>
    </div>
  `;
}

async function appendMessage(msg) {
  const msgContainer = document.getElementById('chat-messages');
  if (!msgContainer) return;

  // Fetch user info for the message
  const user = await getUserProfile(msg.user_id);
  msg.users = user;

  const html = renderMessage(msg);
  msgContainer.insertAdjacentHTML('beforeend', html);
}

async function sendMessage() {
  const input = document.getElementById('chat-input');
  const content = input?.value.trim();
  if (!content || !activeChannelId || !currentProfile) return;

  input.value = '';

  try {
    await supabase.from('messages').insert({
      channel_id: activeChannelId,
      user_id: currentProfile.id,
      content: content
    });
  } catch (err) {
    showToast('Failed to send message', 'error');
    input.value = content;
  }
}

async function handleChatPhoto(event) {
  const file = event.target.files[0];
  if (!file || !activeChannelId || !currentProfile) return;

  try {
    const ext = file.name.split('.').pop();
    const path = `${activeChannelId}/${Date.now()}.${ext}`;
    const url = await uploadFile('chat-images', path, file);

    await supabase.from('messages').insert({
      channel_id: activeChannelId,
      user_id: currentProfile.id,
      content: '\u{1F4F7} Photo',
      image_url: url
    });
  } catch (err) {
    showToast('Failed to upload photo', 'error');
  }

  event.target.value = '';
}

function closeChat() {
  if (chatSubscription) {
    supabase.removeChannel(chatSubscription);
    chatSubscription = null;
  }
  activeChannelId = null;
  navigateTo('community');
}

function scrollToBottom() {
  const container = document.getElementById('chat-messages');
  if (container) {
    requestAnimationFrame(() => {
      container.scrollTop = container.scrollHeight;
    });
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add css/community.css js/community.js
git commit -m "feat: Community chat — channel list, realtime messaging, photo sharing, unread badges"
```

---

### PHASE 3 REVIEW GATE

**STOP.** Run the mandatory 4-agent senior review panel.

1. **Senior App Developer** — test realtime subscription lifecycle (open chat → close → reopen), verify message escaping (XSS), test photo upload flow, check unread count accuracy, verify channel membership queries
2. **Senior Art Director** — review chat bubble visual hierarchy (mine vs others), check channel list information density, verify neon green bubble readability (black text on #BFFF00), review pin message styling
3. **Senior Marketing Strategist** — review channel names (do they match RIU culture?), check empty state copy, evaluate placeholder text in chat input, review photo sharing CTA visibility
4. **Senior UX Designer** — test chat scroll behavior (auto-scroll on new message, preserve scroll position on older messages), verify keyboard doesn't cover input on mobile, check channel list tap target size (44px+), test back navigation from chat

Fix ALL issues before proceeding.

---

## Phase 4: Stats + Profile + Seeding

### Task 10: Stats Screen

**Files:**
- Create: `css/stats.css`
- Create: `js/stats.js`

- [ ] **Step 1: Create css/stats.css**

```css
#screen-stats {
  display: flex;
  flex-direction: column;
  gap: var(--space-lg);
}

/* ===== STATS HEADER ===== */
.stats-hero {
  text-align: center;
  padding: var(--space-lg) 0;
}

.stats-hero .flame {
  font-size: 3rem;
  margin-bottom: var(--space-xs);
}

.stats-hero .streak-number {
  font-family: var(--font-display);
  font-size: 4rem;
  font-weight: 800;
  color: var(--color-secondary);
  line-height: 1;
}

.stats-hero .streak-text {
  font-size: 0.875rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

.stats-row {
  display: flex;
  justify-content: center;
  gap: var(--space-xl);
  margin-top: var(--space-md);
}

.stat-item {
  text-align: center;
}

.stat-value {
  font-family: var(--font-display);
  font-size: 1.5rem;
  font-weight: 800;
  color: var(--color-text);
}

.stat-label {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
}

/* ===== BADGES ===== */
.badges-section h3 {
  font-size: 0.875rem;
  font-family: var(--font-body);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: var(--space-md);
}

.badges-grid {
  display: grid;
  grid-template-columns: repeat(5, 1fr);
  gap: var(--space-sm);
}

.badge-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  text-align: center;
}

.badge-icon {
  width: 48px;
  height: 48px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.badge-item.locked .badge-icon {
  filter: grayscale(1);
  opacity: 0.3;
}

.badge-label {
  font-size: 0.5rem;
  font-weight: 600;
  color: var(--color-text-muted);
  text-transform: uppercase;
  line-height: 1.2;
}

/* ===== LEADERBOARD ===== */
.leaderboard-section h3 {
  font-size: 0.875rem;
  font-family: var(--font-body);
  color: var(--color-text-muted);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-bottom: var(--space-sm);
}

.leaderboard-tabs {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.leaderboard-tabs button {
  padding: var(--space-xs) var(--space-md);
  border-radius: var(--radius-full);
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--color-text-muted);
  background: var(--color-surface);
  transition: all 0.2s;
}

.leaderboard-tabs button.active {
  background: var(--color-primary);
  color: var(--color-bg);
}

.leaderboard-time-tabs {
  display: flex;
  gap: var(--space-xs);
  margin-bottom: var(--space-md);
}

.leaderboard-time-tabs button {
  padding: var(--space-xs) var(--space-sm);
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--color-text-muted);
  border-bottom: 2px solid transparent;
  transition: all 0.2s;
}

.leaderboard-time-tabs button.active {
  color: var(--color-primary);
  border-bottom-color: var(--color-primary);
}

.leaderboard-list {
  display: flex;
  flex-direction: column;
  gap: var(--space-xs);
}

.leaderboard-item {
  display: flex;
  align-items: center;
  gap: var(--space-md);
  padding: var(--space-sm) var(--space-md);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  cursor: pointer;
}

.leaderboard-item.me {
  border: 1px solid var(--color-primary);
  background: rgba(191, 255, 0, 0.05);
}

.lb-rank {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 800;
  color: var(--color-text-muted);
  width: 28px;
  text-align: center;
}

.leaderboard-item:nth-child(1) .lb-rank { color: #FFD700; }
.leaderboard-item:nth-child(2) .lb-rank { color: #C0C0C0; }
.leaderboard-item:nth-child(3) .lb-rank { color: #CD7F32; }

.lb-info {
  flex: 1;
  min-width: 0;
}

.lb-name {
  font-size: 0.875rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: var(--space-xs);
}

.lb-stat {
  font-family: var(--font-display);
  font-size: 1.125rem;
  font-weight: 800;
  color: var(--color-secondary);
}
```

- [ ] **Step 2: Create js/stats.js**

```js
// ===== STATS SCREEN =====
let leaderboardMetric = 'streak'; // 'streak', 'miles', 'checkins'
let leaderboardPeriod = 'alltime'; // 'weekly', 'alltime'

async function initStats() {
  await refreshStats();
}

async function refreshStats() {
  const container = document.getElementById('screen-stats');
  if (!currentProfile) return;

  const stats = await getUserStats(currentProfile.id);
  const badges = await getUserBadges(currentProfile.id);
  const earnedTypes = new Set(badges.map(b => b.badge_type));
  const leaderboard = await getLeaderboard(leaderboardMetric, leaderboardPeriod);

  container.innerHTML = `
    <!-- Stats Hero -->
    <div class="stats-hero">
      <div class="flame">\u{1F525}</div>
      <div class="streak-number">${stats.streak}</div>
      <div class="streak-text">Week Streak</div>
      <div class="stats-row">
        <div class="stat-item">
          <div class="stat-value">${stats.totalCheckIns}</div>
          <div class="stat-label">Check-ins</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${stats.totalMiles.toFixed(1)}</div>
          <div class="stat-label">Miles</div>
        </div>
        <div class="stat-item">
          <div class="stat-value">${formatDate(currentProfile.created_at).split(',')[0]}</div>
          <div class="stat-label">Member Since</div>
        </div>
      </div>
    </div>

    <!-- Badges -->
    <div class="badges-section">
      <h3>Badges</h3>
      <div class="badges-grid">
        ${BADGE_DEFINITIONS.map(def => {
          const earned = earnedTypes.has(def.type);
          return `
            <div class="badge-item ${earned ? '' : 'locked'}" title="${def.description}">
              <div class="badge-icon">${def.icon}</div>
              <div class="badge-label">${def.label}</div>
            </div>
          `;
        }).join('')}
      </div>
    </div>

    <!-- Leaderboard -->
    <div class="leaderboard-section">
      <h3>Leaderboard</h3>
      <div class="leaderboard-tabs">
        <button class="${leaderboardMetric === 'streak' ? 'active' : ''}" onclick="setLeaderboardMetric('streak')">Streak</button>
        <button class="${leaderboardMetric === 'miles' ? 'active' : ''}" onclick="setLeaderboardMetric('miles')">Miles</button>
        <button class="${leaderboardMetric === 'checkins' ? 'active' : ''}" onclick="setLeaderboardMetric('checkins')">Check-ins</button>
      </div>
      <div class="leaderboard-time-tabs">
        <button class="${leaderboardPeriod === 'weekly' ? 'active' : ''}" onclick="setLeaderboardPeriod('weekly')">This Week</button>
        <button class="${leaderboardPeriod === 'alltime' ? 'active' : ''}" onclick="setLeaderboardPeriod('alltime')">All Time</button>
      </div>
      <div class="leaderboard-list">
        ${leaderboard.map((entry, i) => `
          <div class="leaderboard-item ${entry.id === currentProfile.id ? 'me' : ''}"
            onclick="viewMemberProfile('${entry.id}')">
            <span class="lb-rank">${i + 1}</span>
            <img src="${entry.avatar_url || ''}" class="avatar-sm" alt="">
            <div class="lb-info">
              <div class="lb-name">
                ${entry.display_name}
                ${paceGroupBadgeHTML(entry.pace_group)}
              </div>
            </div>
            <span class="lb-stat">${entry.statValue}${leaderboardMetric === 'miles' ? ' mi' : ''}</span>
          </div>
        `).join('')}
        ${leaderboard.length === 0 ? '<div class="empty-state"><p>No data yet. Check in to get on the board!</p></div>' : ''}
      </div>
    </div>
  `;
}

async function getLeaderboard(metric, period) {
  // Get all users with check-ins
  const { data: users } = await supabase.from('users').select('id, display_name, avatar_url, pace_group, created_at');
  if (!users) return [];

  let sinceDate = null;
  if (period === 'weekly') {
    sinceDate = getWeekStart(new Date()).toISOString();
  }

  // Get all check-ins (filtered by period)
  let query = supabase.from('check_ins').select('user_id, miles, checked_in_at, event_type');
  if (sinceDate) query = query.gte('checked_in_at', sinceDate);
  const { data: allCheckIns } = await query;

  // Calculate stats per user
  const userStats = users.map(user => {
    const userCheckIns = (allCheckIns || []).filter(ci => ci.user_id === user.id);
    const totalMiles = userCheckIns.reduce((sum, ci) => sum + (ci.miles || 0), 0);
    const totalCheckIns = userCheckIns.length;
    const streak = calculateStreak(userCheckIns);

    let statValue = 0;
    if (metric === 'streak') statValue = streak;
    else if (metric === 'miles') statValue = Math.round(totalMiles * 10) / 10;
    else if (metric === 'checkins') statValue = totalCheckIns;

    return { ...user, statValue };
  });

  // Sort and return top 10
  userStats.sort((a, b) => b.statValue - a.statValue);
  return userStats.filter(u => u.statValue > 0).slice(0, 10);
}

function setLeaderboardMetric(metric) {
  leaderboardMetric = metric;
  refreshStats();
}

function setLeaderboardPeriod(period) {
  leaderboardPeriod = period;
  refreshStats();
}
```

- [ ] **Step 3: Commit**

```bash
git add css/stats.css js/stats.js
git commit -m "feat: Stats screen — streak hero, badges grid, leaderboard with metric/period toggles"
```

---

### Task 11: Profile Screen

**Files:**
- Create: `css/profile.css`
- Create: `js/profile.js`

- [ ] **Step 1: Create css/profile.css**

```css
#screen-profile,
#screen-member-profile {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: var(--space-lg);
  padding-top: var(--space-xl) !important;
}

.profile-avatar-wrapper {
  position: relative;
}

.profile-edit-avatar {
  position: absolute;
  bottom: 0;
  right: 0;
  width: 32px;
  height: 32px;
  background: var(--color-primary);
  border-radius: var(--radius-full);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
}

.profile-edit-avatar svg {
  width: 16px;
  height: 16px;
  fill: var(--color-bg);
}

.profile-name {
  font-family: var(--font-display);
  font-size: 1.75rem;
  font-weight: 800;
  text-align: center;
}

.profile-meta {
  display: flex;
  align-items: center;
  gap: var(--space-sm);
  flex-wrap: wrap;
  justify-content: center;
}

.profile-meta .detail {
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.profile-stats-row {
  display: flex;
  gap: var(--space-xl);
  background: var(--color-surface);
  border-radius: var(--radius-md);
  padding: var(--space-md) var(--space-xl);
}

.profile-stat {
  text-align: center;
}

.profile-stat .value {
  font-family: var(--font-display);
  font-size: 1.25rem;
  font-weight: 800;
}

.profile-stat .label {
  font-size: 0.625rem;
  color: var(--color-text-muted);
  text-transform: uppercase;
}

.profile-badges {
  display: flex;
  gap: var(--space-sm);
}

.profile-badge-slot {
  width: 56px;
  height: 56px;
  border-radius: var(--radius-md);
  background: var(--color-surface);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 1.5rem;
}

.profile-badge-slot.empty {
  border: 2px dashed var(--color-surface-hover);
  font-size: 0.75rem;
  color: var(--color-text-muted);
}

.profile-actions {
  width: 100%;
  display: flex;
  flex-direction: column;
  gap: var(--space-sm);
  margin-top: auto;
  padding-bottom: var(--space-lg);
}

.btn-logout {
  width: 100%;
  padding: var(--space-md);
  color: var(--color-error);
  font-weight: 600;
  text-align: center;
  border-radius: var(--radius-md);
  background: var(--color-surface);
}
```

- [ ] **Step 2: Create js/profile.js**

```js
// ===== PROFILE SCREEN =====

async function initProfile() {
  await refreshProfile();
}

async function refreshProfile() {
  const container = document.getElementById('screen-profile');
  if (!currentProfile) return;

  const stats = await getUserStats(currentProfile.id);
  const badges = await getUserBadges(currentProfile.id);
  const pinned = await getPinnedBadges(currentProfile.id);

  const pinnedSlots = [null, null, null];
  pinned.forEach(p => {
    if (p.slot >= 1 && p.slot <= 3 && p.badges) {
      const def = BADGE_DEFINITIONS.find(d => d.type === p.badges.badge_type);
      if (def) pinnedSlots[p.slot - 1] = def;
    }
  });

  const runDaysLabel = currentProfile.run_days.includes('tuesday') && currentProfile.run_days.includes('saturday')
    ? 'Both Days'
    : currentProfile.run_days.includes('tuesday') ? 'Tuesdays' : 'Saturdays';

  container.innerHTML = `
    <div class="profile-avatar-wrapper">
      <img src="${currentProfile.avatar_url || ''}" class="avatar-xl" alt="${currentProfile.display_name}">
      <label class="profile-edit-avatar" for="profile-avatar-input">
        <svg viewBox="0 0 24 24"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34c-.39-.39-1.02-.39-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>
      </label>
      <input type="file" id="profile-avatar-input" accept="image/*" class="hidden" onchange="updateProfileAvatar(event)">
    </div>

    <div>
      <div class="profile-name">${currentProfile.display_name}</div>
      <div class="profile-meta">
        ${paceGroupBadgeHTML(currentProfile.pace_group)}
        <span class="detail">\u{1F4C5} ${runDaysLabel}</span>
        <span class="detail">Joined ${formatDate(currentProfile.created_at)}</span>
      </div>
    </div>

    <div class="profile-stats-row">
      <div class="profile-stat">
        <div class="value" style="color: var(--color-secondary);">${stats.streak}</div>
        <div class="label">Streak</div>
      </div>
      <div class="profile-stat">
        <div class="value">${stats.totalCheckIns}</div>
        <div class="label">Check-ins</div>
      </div>
      <div class="profile-stat">
        <div class="value">${stats.totalMiles.toFixed(1)}</div>
        <div class="label">Miles</div>
      </div>
    </div>

    <div>
      <h3 style="font-size: 0.75rem; font-family: var(--font-body); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-sm); text-align: center;">Badge Showcase</h3>
      <div class="profile-badges">
        ${pinnedSlots.map((def, i) => def
          ? `<div class="profile-badge-slot">${def.icon}</div>`
          : `<div class="profile-badge-slot empty">+</div>`
        ).join('')}
      </div>
    </div>

    <div class="profile-actions">
      <button class="btn-secondary" onclick="showEditProfile()">Edit Profile</button>
      <button class="btn-logout" onclick="handleLogout()">Log Out</button>
    </div>
  `;
}

async function viewMemberProfile(userId) {
  if (userId === currentProfile?.id) {
    navigateTo('profile');
    return;
  }

  const container = document.getElementById('screen-member-profile');
  const profile = await getUserProfile(userId);
  if (!profile) return;

  const stats = await getUserStats(userId);
  const badges = await getUserBadges(userId);
  const pinned = await getPinnedBadges(userId);

  const pinnedSlots = [null, null, null];
  pinned.forEach(p => {
    if (p.slot >= 1 && p.slot <= 3 && p.badges) {
      const def = BADGE_DEFINITIONS.find(d => d.type === p.badges.badge_type);
      if (def) pinnedSlots[p.slot - 1] = def;
    }
  });

  const runDaysLabel = profile.run_days.includes('tuesday') && profile.run_days.includes('saturday')
    ? 'Both Days'
    : profile.run_days.includes('tuesday') ? 'Tuesdays' : 'Saturdays';

  container.innerHTML = `
    <button class="auth-back" onclick="navigateBack()" style="align-self: flex-start;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Back
    </button>

    <img src="${profile.avatar_url || ''}" class="avatar-xl" alt="${profile.display_name}">

    <div>
      <div class="profile-name">${profile.display_name}</div>
      <div class="profile-meta">
        ${paceGroupBadgeHTML(profile.pace_group)}
        <span class="detail">\u{1F4C5} ${runDaysLabel}</span>
        <span class="detail">Joined ${formatDate(profile.created_at)}</span>
      </div>
    </div>

    <div class="profile-stats-row">
      <div class="profile-stat">
        <div class="value" style="color: var(--color-secondary);">${stats.streak}</div>
        <div class="label">Streak</div>
      </div>
      <div class="profile-stat">
        <div class="value">${stats.totalCheckIns}</div>
        <div class="label">Check-ins</div>
      </div>
      <div class="profile-stat">
        <div class="value">${stats.totalMiles.toFixed(1)}</div>
        <div class="label">Miles</div>
      </div>
    </div>

    <div>
      <h3 style="font-size: 0.75rem; font-family: var(--font-body); color: var(--color-text-muted); text-transform: uppercase; letter-spacing: 0.1em; margin-bottom: var(--space-sm); text-align: center;">Badge Showcase</h3>
      <div class="profile-badges">
        ${pinnedSlots.map(def => def
          ? `<div class="profile-badge-slot">${def.icon}</div>`
          : `<div class="profile-badge-slot empty"></div>`
        ).join('')}
      </div>
    </div>

    <button class="btn-primary btn-orange" onclick="openBuddyFromProfile('${userId}')">
      \u{1F91D} Run Together
    </button>
  `;

  navigateToSub('member-profile');
}

function openBuddyFromProfile(userId) {
  // Determine next run day and open buddy board
  const nextTuesday = getNextRunDate(2);
  const nextSaturday = getNextRunDate(6);
  const nextDate = nextTuesday < nextSaturday ? nextTuesday : nextSaturday;
  const runDay = nextTuesday < nextSaturday ? 'tuesday' : 'saturday';
  openBuddyBoard(runDay, nextDate.toISOString().split('T')[0]);
}

async function updateProfileAvatar(event) {
  const file = event.target.files[0];
  if (!file || !currentProfile) return;

  try {
    const ext = file.name.split('.').pop();
    const path = `${currentProfile.id}/avatar.${ext}`;
    const url = await uploadFile('avatars', path, file);
    currentProfile = await updateUserProfile(currentProfile.id, { avatar_url: url });

    // Update header avatar too
    document.getElementById('header-avatar').src = url;

    showToast('Avatar updated!', 'success');
    refreshProfile();
  } catch (err) {
    showToast('Failed to update avatar', 'error');
  }
}

function showEditProfile() {
  const container = document.getElementById('screen-profile');

  container.innerHTML = `
    <button class="auth-back" onclick="refreshProfile()" style="align-self: flex-start;">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      Cancel
    </button>

    <h2>Edit Profile</h2>

    <div class="form-group" style="width: 100%;">
      <label class="form-label">Display Name</label>
      <input class="form-input" type="text" id="edit-name" value="${currentProfile.display_name}">
    </div>

    <div style="width: 100%;">
      <label class="form-label" style="display: block; margin-bottom: var(--space-sm);">Pace Group</label>
      <div class="option-grid">
        ${Object.entries(PACE_GROUPS).map(([key, info]) => `
          <button class="option-card ${currentProfile.pace_group === key ? 'selected' : ''}" onclick="selectEditPaceGroup(this, '${key}')">
            <div class="option-info">
              <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">${info.label}</h4>
              <p>${info.pace}</p>
            </div>
          </button>
        `).join('')}
      </div>
    </div>

    <div style="width: 100%;">
      <label class="form-label" style="display: block; margin-bottom: var(--space-sm);">Run Days</label>
      <div class="option-grid">
        <button class="option-card ${currentProfile.run_days.includes('tuesday') ? 'selected' : ''}" onclick="toggleEditRunDay(this, 'tuesday')">
          <div class="option-info">
            <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">Tuesday Nights</h4>
            <p>Deep Ellum — 7:00 PM</p>
          </div>
        </button>
        <button class="option-card ${currentProfile.run_days.includes('saturday') ? 'selected' : ''}" onclick="toggleEditRunDay(this, 'saturday')">
          <div class="option-info">
            <h4 style="font-family: var(--font-body); text-transform: none; letter-spacing: normal;">Saturday Mornings</h4>
            <p>Fair Oaks Park — 8:00 AM</p>
          </div>
        </button>
      </div>
    </div>

    <div class="profile-actions">
      <button class="btn-primary" onclick="saveProfile()">Save Changes</button>
    </div>
  `;
}

let editPaceGroup = null;
let editRunDays = [];

function selectEditPaceGroup(el, group) {
  document.querySelectorAll('#screen-profile .option-grid:first-of-type .option-card').forEach(c => c.classList.remove('selected'));
  el.classList.add('selected');
  editPaceGroup = group;
}

function toggleEditRunDay(el, day) {
  el.classList.toggle('selected');
  if (!editRunDays) editRunDays = [...currentProfile.run_days];
  const idx = editRunDays.indexOf(day);
  if (idx >= 0) editRunDays.splice(idx, 1);
  else editRunDays.push(day);
}

async function saveProfile() {
  const name = document.getElementById('edit-name')?.value.trim();
  if (!name) { showToast('Name cannot be empty', 'error'); return; }

  const updates = { display_name: name };
  if (editPaceGroup) updates.pace_group = editPaceGroup;
  if (editRunDays && editRunDays.length > 0) updates.run_days = editRunDays;

  try {
    currentProfile = await updateUserProfile(currentProfile.id, updates);
    showToast('Profile updated!', 'success');
    editPaceGroup = null;
    editRunDays = [];
    refreshProfile();
  } catch (err) {
    showToast('Update failed', 'error');
  }
}

async function handleLogout() {
  await signOut();
}
```

- [ ] **Step 3: Commit**

```bash
git add css/profile.css js/profile.js
git commit -m "feat: Profile screen — own profile, member profiles, edit profile, avatar upload, logout"
```

---

### Task 12: Demo Seeding Script

**Files:**
- Create: `js/seed.js`

- [ ] **Step 1: Create js/seed.js**

This script runs once via the browser console to populate the demo with realistic data. It requires an admin Supabase client using the service role key (NOT the anon key — run from the Supabase SQL Editor or use the service role key temporarily).

```js
// ===== DEMO SEED SCRIPT =====
// Run this ONCE from the browser console or as a standalone script
// Uses the existing Supabase client (must be authenticated as admin or use service role)

async function seedDemo() {
  console.log('Seeding demo data...');

  // 1. Create fake users via Supabase Auth admin API
  // NOTE: For the demo, seed users directly into the public.users table
  // with UUIDs. In production, users would go through proper auth.

  const fakeUsers = [
    { id: crypto.randomUUID(), display_name: 'Theo M.', pace_group: 'run_it_up', run_days: ['tuesday', 'saturday'], role: 'admin' },
    { id: crypto.randomUUID(), display_name: 'Brianna J.', pace_group: 'jog_it_up', run_days: ['tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Marcus W.', pace_group: 'sprint_it_up', run_days: ['tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Aaliyah R.', pace_group: 'walk_it_up', run_days: ['saturday'] },
    { id: crypto.randomUUID(), display_name: 'DeAndre K.', pace_group: 'run_it_up', run_days: ['tuesday'] },
    { id: crypto.randomUUID(), display_name: 'Jasmine T.', pace_group: 'jog_it_up', run_days: ['tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Chris B.', pace_group: 'sprint_it_up', run_days: ['tuesday'] },
    { id: crypto.randomUUID(), display_name: 'Keisha P.', pace_group: 'run_it_up', run_days: ['saturday'] },
    { id: crypto.randomUUID(), display_name: 'Darnell H.', pace_group: 'jog_it_up', run_days: ['tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Tasha L.', pace_group: 'walk_it_up', run_days: ['tuesday'] },
    { id: crypto.randomUUID(), display_name: 'Jordan F.', pace_group: 'run_it_up', run_days: ['tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Destiny M.', pace_group: 'jog_it_up', run_days: ['saturday'] },
    { id: crypto.randomUUID(), display_name: 'Andre C.', pace_group: 'sprint_it_up', run_days: ['tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Mia S.', pace_group: 'walk_it_up', run_days: ['tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Tyler G.', pace_group: 'run_it_up', run_days: ['tuesday'] },
    { id: crypto.randomUUID(), display_name: 'Kayla D.', pace_group: 'jog_it_up', run_days: ['tuesday', 'saturday'] },
  ];

  // NOTE: These users need to exist in auth.users first for RLS to work.
  // For demo seeding, temporarily disable RLS or use service role key.
  // The actual seeding approach will be: run SQL INSERT directly via Supabase SQL Editor.

  console.log('Generated', fakeUsers.length, 'fake users');
  console.log('Copy the SQL below and run it in Supabase SQL Editor:');

  // Generate SQL for seeding
  let sql = '-- DEMO SEED DATA\n';
  sql += '-- Run this in Supabase SQL Editor\n\n';

  // Insert fake auth users (minimal)
  fakeUsers.forEach(u => {
    sql += `INSERT INTO auth.users (id, email, encrypted_password, email_confirmed_at, created_at, updated_at, instance_id, aud, role)
VALUES ('${u.id}', '${u.display_name.toLowerCase().replace(/[^a-z]/g, '')}@demo.runitup.com', crypt('demo1234', gen_salt('bf')), NOW(), NOW() - interval '${Math.floor(Math.random() * 300)} days', NOW(), '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated')
ON CONFLICT (id) DO NOTHING;\n`;
  });

  sql += '\n';

  // Insert public profiles
  fakeUsers.forEach(u => {
    sql += `INSERT INTO public.users (id, display_name, pace_group, run_days, role, created_at)
VALUES ('${u.id}', '${u.display_name}', '${u.pace_group}', '{${u.run_days.join(',')}}', '${u.role || 'member'}', NOW() - interval '${Math.floor(Math.random() * 300)} days')
ON CONFLICT (id) DO NOTHING;\n`;
  });

  sql += '\n-- Channel memberships\n';

  // Get channel IDs
  const { data: channels } = await supabase.from('channels').select('id, name');
  const channelMap = {};
  (channels || []).forEach(c => { channelMap[c.name] = c.id; });

  // Join all users to general + newbies + their pace/day channels
  fakeUsers.forEach(u => {
    const toJoin = ['general', 'newbies'];
    toJoin.push(u.pace_group.replace(/_/g, '-'));
    if (u.run_days.includes('tuesday')) toJoin.push('tuesday-deep-ellum');
    if (u.run_days.includes('saturday')) toJoin.push('saturday-fair-oaks');

    toJoin.forEach(chName => {
      const chId = channelMap[chName];
      if (chId) {
        sql += `INSERT INTO public.channel_members (channel_id, user_id) VALUES ('${chId}', '${u.id}') ON CONFLICT DO NOTHING;\n`;
      }
    });
  });

  sql += '\n-- Messages\n';

  const sampleMessages = [
    { channel: 'general', messages: [
      "who's pulling up Tuesday??",
      "just signed up, first time running with a group!",
      "that Deep Ellum run last week was CRAZY. 200+ people!",
      "anyone know if we're still meeting at the same spot?",
      "the energy at Saturday runs is unmatched fr",
      "just hit my 10 week streak!! lets gooo",
      "new here, kinda nervous but excited",
      "Theo's warm-up playlists never miss",
      "brought my sister last week and now she's hooked",
      "RIU changed my whole fitness journey no cap"
    ]},
    { channel: 'newbies', messages: [
      "hey everyone! first run this Saturday, what should I expect?",
      "just show up! everyone is super welcoming",
      "do I need to be fast? I can barely jog a mile rn",
      "I was the same way 3 months ago, now I'm doing 5Ks!",
      "no pace group is 'slow' here, we all started somewhere",
      "what should I wear?",
      "comfortable shoes and whatever you feel good in"
    ]},
    { channel: 'fit-check', messages: [
      "new Nikes for Saturday, who's matching?",
      "all black everything for the night run",
      "the RIU merch goes crazy with everything",
      "fit check: neon green to match the logo"
    ]},
    { channel: 'post-run-pics', messages: [
      "Deep Ellum sunset hits different after 2 miles",
      "group photo from Saturday! we had 300 people!!",
      "my before and after from 6 months of RIU",
      "the vibes were immaculate last night"
    ]},
    { channel: 'tuesday-deep-ellum', messages: [
      "see yall at 7!",
      "parking is easier if you come from Main St side",
      "the DJ was going crazy last week",
      "is it supposed to rain Tuesday?",
      "rain or shine we run!"
    ]},
    { channel: 'saturday-fair-oaks', messages: [
      "8am sharp, don't oversleep",
      "the trail was beautiful this morning",
      "who else is trying the 5 mile route?",
      "I'll be at the 3 mile group, come find me"
    ]}
  ];

  sampleMessages.forEach(({ channel, messages }) => {
    const chId = channelMap[channel];
    if (!chId) return;
    messages.forEach((msg, i) => {
      const user = fakeUsers[Math.floor(Math.random() * fakeUsers.length)];
      const hoursAgo = Math.floor(Math.random() * 168); // within last week
      sql += `INSERT INTO public.messages (channel_id, user_id, content, created_at)
VALUES ('${chId}', '${user.id}', '${msg.replace(/'/g, "''")}', NOW() - interval '${hoursAgo} hours');\n`;
    });
  });

  sql += '\n-- Check-ins (last 12 weeks)\n';

  // Generate check-ins over past 12 weeks
  for (let week = 0; week < 12; week++) {
    fakeUsers.forEach(u => {
      // 70% chance of showing up each week
      if (Math.random() > 0.7) return;

      if (u.run_days.includes('tuesday') && Math.random() > 0.3) {
        const date = new Date();
        date.setDate(date.getDate() - (week * 7) - date.getDay() + 2); // Tuesday
        date.setHours(19, Math.floor(Math.random() * 30), 0, 0);
        const miles = (1 + Math.random() * 2).toFixed(1);
        sql += `INSERT INTO public.check_ins (user_id, event_type, miles, checked_in_at) VALUES ('${u.id}', 'weekly_tuesday', ${miles}, '${date.toISOString()}');\n`;
      }

      if (u.run_days.includes('saturday') && Math.random() > 0.3) {
        const date = new Date();
        date.setDate(date.getDate() - (week * 7) - date.getDay() + 6); // Saturday
        date.setHours(8, Math.floor(Math.random() * 30), 0, 0);
        const miles = (2 + Math.random() * 3).toFixed(1);
        sql += `INSERT INTO public.check_ins (user_id, event_type, miles, checked_in_at) VALUES ('${u.id}', 'weekly_saturday', ${miles}, '${date.toISOString()}');\n`;
      }
    });
  }

  sql += '\n-- Special events\n';

  const pastEventId = crypto.randomUUID();
  const upcomingEventId = crypto.randomUUID();
  const futureEventId = crypto.randomUUID();

  sql += `INSERT INTO public.special_events (id, title, description, location_name, location_address, event_date, created_by) VALUES
('${pastEventId}', 'Wine Down Wednesday Mixer', 'Post-run social mixer with wine, music, and good vibes. Celebrating 2 years of community.', 'La Marca Prosecco', '2800 Main St, Dallas, TX 75226', '${new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()}', '${fakeUsers[0].id}'),
('${upcomingEventId}', 'Adult Field Day', 'Relay races, tug of war, sack races, and more! Bring your competitive spirit and your squad.', 'Fair Oaks Park', '7501 Fair Oaks Ave, Dallas, TX 75231', '${new Date(Date.now() + 18 * 24 * 60 * 60 * 1000).toISOString()}', '${fakeUsers[0].id}'),
('${futureEventId}', 'Juneteenth Freedom Run 5K', 'Annual Juneteenth celebration run through Deep Ellum. All proceeds benefit the Run It Up Foundation.', 'Deep Ellum', 'Deep Ellum, Dallas, TX', '${new Date(2026, 5, 19, 8, 0).toISOString()}', '${fakeUsers[0].id}');\n`;

  sql += '\n-- RSVPs\n';
  fakeUsers.slice(0, 10).forEach(u => {
    sql += `INSERT INTO public.event_rsvps (event_id, user_id) VALUES ('${upcomingEventId}', '${u.id}') ON CONFLICT DO NOTHING;\n`;
  });

  sql += '\n-- Buddy requests for next run\n';
  const nextTuesday = getNextRunDate(2).toISOString().split('T')[0];
  const buddyUsers = fakeUsers.filter(u => u.run_days.includes('tuesday')).slice(0, 5);
  buddyUsers.forEach(u => {
    const intros = ["First time, looking for someone to run with!", "Coming from Fort Worth, don't know anyone yet", "Just want a running buddy for accountability", "New to the club, who wants to jog together?", "Trying to get back into running, need motivation"];
    const intro = intros[Math.floor(Math.random() * intros.length)];
    sql += `INSERT INTO public.buddy_requests (user_id, run_day, run_date, intro_line) VALUES ('${u.id}', 'tuesday', '${nextTuesday}', '${intro.replace(/'/g, "''")}') ON CONFLICT DO NOTHING;\n`;
  });

  sql += '\n-- Badges\n';
  fakeUsers.forEach(u => {
    // Give badges based on how long they've been "members"
    sql += `INSERT INTO public.badges (user_id, badge_type) VALUES ('${u.id}', 'first_step') ON CONFLICT DO NOTHING;\n`;
    if (Math.random() > 0.3) sql += `INSERT INTO public.badges (user_id, badge_type) VALUES ('${u.id}', 'both_sides') ON CONFLICT DO NOTHING;\n`;
    if (Math.random() > 0.5) sql += `INSERT INTO public.badges (user_id, badge_type) VALUES ('${u.id}', 'night_runner') ON CONFLICT DO NOTHING;\n`;
    if (Math.random() > 0.5) sql += `INSERT INTO public.badges (user_id, badge_type) VALUES ('${u.id}', 'early_bird') ON CONFLICT DO NOTHING;\n`;
    if (Math.random() > 0.6) sql += `INSERT INTO public.badges (user_id, badge_type) VALUES ('${u.id}', 'streak_week') ON CONFLICT DO NOTHING;\n`;
    if (Math.random() > 0.8) sql += `INSERT INTO public.badges (user_id, badge_type) VALUES ('${u.id}', 'on_fire') ON CONFLICT DO NOTHING;\n`;
  });

  console.log('\n========== COPY BELOW ==========\n');
  console.log(sql);
  console.log('\n========== COPY ABOVE ==========\n');
  console.log('Paste the SQL above into Supabase SQL Editor and run it.');

  return sql;
}

// Run: seedDemo()
```

- [ ] **Step 2: Commit**

```bash
git add js/seed.js
git commit -m "feat: demo seeding script — 16 fake users, messages, check-ins, events, badges, buddy requests"
```

---

### Task 13: Logo + Assets

**Files:**
- Create: `assets/logo.svg`
- Create: `assets/og-image.png` (generated)

- [ ] **Step 1: Create assets/logo.svg**

Recreate the RIU logo as SVG based on the Instagram profile screenshot — bold stacked "RUN IT UP!" text on a black circle:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 200">
  <circle cx="100" cy="100" r="100" fill="#0A0A0A"/>
  <text x="100" y="72" text-anchor="middle" font-family="'Arial Black', 'Big Shoulders Display', sans-serif" font-weight="900" font-size="38" fill="#BFFF00" letter-spacing="2">RUN</text>
  <text x="100" y="118" text-anchor="middle" font-family="'Arial Black', 'Big Shoulders Display', sans-serif" font-weight="900" font-size="48" fill="#BFFF00" letter-spacing="2">IT</text>
  <text x="100" y="160" text-anchor="middle" font-family="'Arial Black', 'Big Shoulders Display', sans-serif" font-weight="900" font-size="38" fill="#BFFF00" letter-spacing="2">UP!</text>
  <text x="100" y="178" text-anchor="middle" font-family="'Inter', sans-serif" font-weight="600" font-size="8" fill="#8A8A8A" letter-spacing="4">SOCIAL RUN CLUB</text>
</svg>
```

- [ ] **Step 2: Generate PWA icons**

Use the SVG to create PNG icons at 192x192 and 512x512 via a converter tool or by rendering in browser and downloading.

Run in browser console:
```js
const svg = document.querySelector('img[src="/assets/logo.svg"]');
// Or use an online SVG to PNG converter for the two sizes
```

Alternatively, use ImageMagick:
```bash
# If ImageMagick is installed:
# convert -background none -size 192x192 assets/logo.svg assets/logo-192.png
# convert -background none -size 512x512 assets/logo.svg assets/logo-512.png
```

For the demo, the SVG logo will work fine for the header. Create placeholder PNGs that can be refined later.

- [ ] **Step 3: Commit**

```bash
git add assets/
git commit -m "feat: logo SVG + PWA icon assets"
```

---

### PHASE 4 REVIEW GATE

**STOP.** Run the mandatory 4-agent senior review panel.

1. **Senior App Developer** — test full end-to-end flow (signup → onboarding → home → check in → events → buddy → chat → stats → profile → logout → login), verify seeding script generates valid SQL, check for memory leaks in realtime subscriptions, test all CRUD operations against RLS
2. **Senior Art Director** — comprehensive visual audit across all screens on iPhone viewport (375px), check color consistency (are we using CSS vars everywhere?), verify typography hierarchy, check dark mode contrast ratios for accessibility, review badge icon sizes and grid alignment, check profile layout spacing
3. **Senior Marketing Strategist** — read every piece of user-facing copy in the app, evaluate if it matches RIU's voice (hype, street culture, inclusive, "built by the community"), rewrite any copy that feels generic/corporate, evaluate the demo seeding messages (do they feel real?), check badge names (are they fun enough?), evaluate empty states
4. **Senior UX Designer** — test every navigation path and back-button flow, verify all touch targets are 44px+, check form validation and error states, test loading states (are there spinners where needed?), verify tab bar badge updates correctly, test profile edit flow, review onboarding for friction

Fix ALL issues before deploying.

---

## Phase 5: Deploy

### Task 14: Netlify Deployment

- [ ] **Step 1: Create netlify.toml**

```toml
[build]
  publish = "."

[[redirects]]
  from = "/*"
  to = "/index.html"
  status = 200
```

- [ ] **Step 2: Deploy to Netlify**

```bash
cd /Users/nelsontaylor/Documents/runitup-app
npx netlify-cli deploy --prod --dir=.
```

Or connect the repo to Netlify via the dashboard for automatic deploys.

Expected: App live at a Netlify URL (e.g., runitup-dallas.netlify.app)

- [ ] **Step 3: Run seeding**

Run `seedDemo()` in the browser console on the deployed app, copy the SQL output, and paste it into Supabase SQL Editor. Execute it.

Verify: Refresh the app. The home screen should show community highlights, the leaderboard should have entries, community channels should have messages, and buddy requests should appear.

- [ ] **Step 4: Test on iPhone**

Open the deployed URL on an iPhone:
- Add to Home Screen (PWA)
- Sign up → onboard → verify all screens
- Check in → verify stats update
- Open chat → send a message → verify realtime
- View leaderboard → tap a member → view their profile
- Test buddy board → create request → match

- [ ] **Step 5: Final commit**

```bash
git add netlify.toml
git commit -m "feat: Netlify deployment config + demo seeding complete"
```

---

### FINAL REVIEW GATE

Run the 4-agent review one last time on the deployed, seeded app.

1. **Senior App Developer** — Lighthouse audit (target: Performance 90+, A11y 90+, SEO 90+), check HTTPS, verify service worker caching, test offline shell, check for console errors
2. **Senior Art Director** — visual QA on real iPhone hardware, check for layout overflow, verify splash screen feels premium, check OG image if generated
3. **Senior Marketing Strategist** — pretend to be Theo seeing this for the first time. Does the demo sell itself? Is there anything confusing? What would make him say "how much?"
4. **Senior UX Designer** — simulate the in-person demo: open app on phone → sign up → explore each tab. Where does the demo feel slow? Where does it delight? Is there a dead end?

Fix ALL issues. Then it's ready for the pitch.
