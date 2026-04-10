# Supabase Deployment Guide

## Edge Function: delete-account

Required by Apple App Store Review Guideline 5.1.1(v) — apps with account
creation must offer in-app account deletion.

### Deploy

```bash
# Install Supabase CLI if you haven't
brew install supabase/tap/supabase

# Login to Supabase
supabase login

# Link this project to the remote
cd /Users/nelsontaylor/Documents/runitup-app
supabase link --project-ref rouvbfejsyfcmswlsezd

# Deploy the function
supabase functions deploy delete-account
```

The function is automatically available at:
`https://rouvbfejsyfcmswlsezd.supabase.co/functions/v1/delete-account`

The client-side `handleDeleteAccount()` in `js/profile.js` already calls it
via `supabaseClient.functions.invoke('delete-account')`.

### Verify

Sign in as a test user, go to Profile → Delete My Account, confirm twice.
The user should be fully removed from both `public.users` and `auth.users`.

---

## Migration: Guest Account Cleanup

Cleans up guest users (`*@runitup.demo`) older than 7 days.

### Deploy

```bash
# Push the migration to the remote database
supabase db push
```

### Schedule (requires pg_cron extension enabled in Supabase dashboard)

Go to **Database → Extensions** and enable `pg_cron`, then run in the SQL
editor:

```sql
SELECT cron.schedule(
  'cleanup-guests',
  '0 4 * * *',  -- daily at 4 AM
  $$SELECT cleanup_old_guests()$$
);
```

To verify the job is scheduled:
```sql
SELECT * FROM cron.job;
```

To run it manually:
```sql
SELECT cleanup_old_guests();
```
