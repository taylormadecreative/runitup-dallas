-- Guest account cleanup
-- Removes guest users (email ends with @runitup.demo) older than 7 days.
-- This prevents the auth.users table from accumulating orphaned guest records
-- from the "Explore as Guest" splash screen flow.
--
-- Deploy: run this migration once, then schedule it via pg_cron:
--   SELECT cron.schedule('cleanup-guests', '0 4 * * *', 'SELECT cleanup_old_guests();');

CREATE OR REPLACE FUNCTION cleanup_old_guests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  -- Delete public.users rows for guests older than 7 days
  -- (cascades will clean up check_ins, messages, badges, etc.)
  DELETE FROM public.users
  WHERE id IN (
    SELECT id
    FROM auth.users
    WHERE email LIKE '%@runitup.demo'
      AND created_at < NOW() - INTERVAL '7 days'
  );

  -- Delete the auth.users rows (requires service role or SECURITY DEFINER)
  DELETE FROM auth.users
  WHERE email LIKE '%@runitup.demo'
    AND created_at < NOW() - INTERVAL '7 days';
END;
$$;

-- Grant execute permission to the service role only
REVOKE ALL ON FUNCTION cleanup_old_guests() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION cleanup_old_guests() TO service_role;
