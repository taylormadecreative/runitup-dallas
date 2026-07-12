// ===== DEMO SEED SCRIPT =====
// Run this ONCE from the browser console or as a standalone script
// Uses the existing Supabase client (must be authenticated as admin or use service role)

async function seedDemo() {
  console.log('Seeding demo data...');

  // 1. Create fake users via Supabase Auth admin API
  // NOTE: For the demo, seed users directly into the public.users table
  // with UUIDs. In production, users would go through proper auth.

  const fakeUsers = [
    { id: crypto.randomUUID(), display_name: 'Theo M.', pace_group: 'run_it_up', run_days: ['monday', 'tuesday', 'saturday'], role: 'admin' },
    { id: crypto.randomUUID(), display_name: 'Brianna J.', pace_group: 'jog_it_up', run_days: ['tuesday', 'saturday', 'sunday'] },
    { id: crypto.randomUUID(), display_name: 'Marcus W.', pace_group: 'sprint_it_up', run_days: ['monday', 'tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Aaliyah R.', pace_group: 'walk_it_up', run_days: ['saturday', 'sunday'] },
    { id: crypto.randomUUID(), display_name: 'DeAndre K.', pace_group: 'run_it_up', run_days: ['monday', 'tuesday'] },
    { id: crypto.randomUUID(), display_name: 'Jasmine T.', pace_group: 'jog_it_up', run_days: ['tuesday', 'saturday', 'sunday'] },
    { id: crypto.randomUUID(), display_name: 'Chris B.', pace_group: 'sprint_it_up', run_days: ['monday', 'tuesday'] },
    { id: crypto.randomUUID(), display_name: 'Keisha P.', pace_group: 'run_it_up', run_days: ['saturday', 'sunday'] },
    { id: crypto.randomUUID(), display_name: 'Darnell H.', pace_group: 'jog_it_up', run_days: ['tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Tasha L.', pace_group: 'walk_it_up', run_days: ['tuesday', 'sunday'] },
    { id: crypto.randomUUID(), display_name: 'Jordan F.', pace_group: 'run_it_up', run_days: ['monday', 'tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Destiny M.', pace_group: 'jog_it_up', run_days: ['saturday', 'sunday'] },
    { id: crypto.randomUUID(), display_name: 'Andre C.', pace_group: 'sprint_it_up', run_days: ['tuesday', 'saturday'] },
    { id: crypto.randomUUID(), display_name: 'Mia S.', pace_group: 'walk_it_up', run_days: ['monday', 'tuesday', 'sunday'] },
    { id: crypto.randomUUID(), display_name: 'Tyler G.', pace_group: 'run_it_up', run_days: ['monday', 'tuesday'] },
    { id: crypto.randomUUID(), display_name: 'Kayla D.', pace_group: 'jog_it_up', run_days: ['tuesday', 'saturday', 'sunday'] },
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
  const { data: channels } = await supabaseClient.from('channels').select('id, name');
  const channelMap = {};
  (channels || []).forEach(c => { channelMap[c.name] = c.id; });

  // Join all users to general + newbies + their pace/day channels
  fakeUsers.forEach(u => {
    const toJoin = ['general', 'newbies'];
    toJoin.push(u.pace_group.replace(/_/g, '-'));
    if (u.run_days.includes('monday')) toJoin.push('monday-trinity-groves');
    if (u.run_days.includes('tuesday')) toJoin.push('tuesday-deep-ellum');
    if (u.run_days.includes('saturday')) toJoin.push('saturday-fair-oaks');
    if (u.run_days.includes('sunday')) toJoin.push('sunday-levy-plaza');

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
    { channel: 'monday-trinity-groves', messages: [
      "Monday crew pulling up tonight!",
      "Trinity Groves is always a vibe",
      "first Monday run was amazing, see yall next week",
      "who else is doing the Katy Trail route this week?"
    ]},
    { channel: 'tuesday-deep-ellum', messages: [
      "see yall at 7!",
      "parking is easier if you come from Main St side",
      "the DJ was going crazy last week",
      "is it supposed to rain Tuesday?",
      "rain or shine we run!"
    ]},
    { channel: 'saturday-fair-oaks', messages: [
      "8:30am sharp, don't oversleep",
      "the trail was beautiful this morning",
      "who else is trying the 5 mile route?",
      "I'll be at the 3 mile group, come find me"
    ]},
    { channel: 'sunday-levy-plaza', messages: [
      "Sunday morning runs at Las Colinas are lowkey the best",
      "that view around the lake never gets old",
      "who's coming Sunday? let's get it",
      "morning run then brunch, that's the move"
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

      if (u.run_days.includes('monday') && Math.random() > 0.3) {
        const date = new Date();
        date.setDate(date.getDate() - (week * 7) - date.getDay() + 1); // Monday
        date.setHours(19, Math.floor(Math.random() * 30), 0, 0);
        const miles = (1.5 + Math.random() * 1).toFixed(1);
        sql += `INSERT INTO public.check_ins (user_id, event_type, miles, checked_in_at) VALUES ('${u.id}', 'weekly_monday', ${miles}, '${date.toISOString()}');\n`;
      }

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

      if (u.run_days.includes('sunday') && Math.random() > 0.3) {
        const date = new Date();
        date.setDate(date.getDate() - (week * 7) - date.getDay()); // Sunday
        date.setHours(8, Math.floor(Math.random() * 30), 0, 0);
        const miles = (2 + Math.random() * 2).toFixed(1);
        sql += `INSERT INTO public.check_ins (user_id, event_type, miles, checked_in_at) VALUES ('${u.id}', 'weekly_sunday', ${miles}, '${date.toISOString()}');\n`;
      }
    });
  }

  sql += '\n-- Special events\n';

  const brunchEventId = crypto.randomUUID();
  const fieldDayEventId = crypto.randomUUID();
  const dearFathersEventId = crypto.randomUUID();
  const juneteenthEventId = crypto.randomUUID();

  sql += `INSERT INTO public.special_events (id, title, description, location_name, location_address, event_date, created_by) VALUES
('${brunchEventId}', 'Run + Brunch @ Atelie', 'Morning run followed by brunch at Atelie. Good food, good people, great vibes.', 'Atelie', '367 W Jefferson Blvd, Dallas, TX', '2026-04-11T09:00:00.000Z', '${fakeUsers[0].id}'),
('${fieldDayEventId}', 'Adult Field Day', 'Relay races, tug of war, sack races, and more! Bring your competitive spirit and your squad.', 'Behind Every Door', '1007 Hutchins Rd, Dallas, TX', '2026-04-18T08:00:00.000Z', '${fakeUsers[0].id}'),
('${dearFathersEventId}', 'Dear Fathers Event', 'A special evening event celebrating fathers in the Run It UP community.', 'Globe Life Field Area', 'Globe Life Field, Arlington, TX', '2026-04-25T18:45:00.000Z', '${fakeUsers[0].id}'),
('${juneteenthEventId}', 'Juneteenth Freedom Run 5K', 'Annual Juneteenth celebration run through Deep Ellum. All proceeds benefit the Run It Up Foundation.', 'Deep Ellum', 'Deep Ellum, Dallas, TX', '${new Date(2026, 5, 19, 8, 0).toISOString()}', '${fakeUsers[0].id}');\n`;

  sql += '\n-- RSVPs\n';
  fakeUsers.slice(0, 10).forEach(u => {
    sql += `INSERT INTO public.event_rsvps (event_id, user_id) VALUES ('${brunchEventId}', '${u.id}') ON CONFLICT DO NOTHING;\n`;
  });
  fakeUsers.slice(0, 8).forEach(u => {
    sql += `INSERT INTO public.event_rsvps (event_id, user_id) VALUES ('${fieldDayEventId}', '${u.id}') ON CONFLICT DO NOTHING;\n`;
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
