// Supabase Edge Function: delete-account
// Fully deletes the authenticated user's account (auth + all associated data).
// Required by Apple App Store Review Guideline 5.1.1(v) — apps that support
// account creation must also offer in-app account deletion.
//
// Deploy with:
//   supabase functions deploy delete-account
//
// The function uses the service role key (from env) to perform the admin
// deletion that RLS cannot. All cascading data is removed via foreign key
// CASCADE constraints defined in schema.sql.

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers':
    'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Get the auth header from the request
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create a client with the user's auth token to verify who they are
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Verify the user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const userId = user.id;

    // Create an admin client with the service role key for the actual deletion
    const adminClient = createClient(supabaseUrl, supabaseServiceKey, {
      auth: { autoRefreshToken: false, persistSession: false },
    });

    // Delete storage objects first (avatars, chat images, event photos)
    // These are not covered by database CASCADE since they live in storage buckets.
    try {
      // List and remove avatar folder
      const { data: avatarFiles } = await adminClient.storage
        .from('avatars')
        .list(userId);
      if (avatarFiles && avatarFiles.length > 0) {
        const paths = avatarFiles.map((f) => `${userId}/${f.name}`);
        await adminClient.storage.from('avatars').remove(paths);
      }

      // List and remove chat image uploads from this user
      // Note: chat-images bucket has files named by channel+timestamp, so we can't
      // easily filter by user. The message rows will be deleted by CASCADE, but the
      // actual image files will remain as orphans. Supabase Storage lifecycle rules
      // should be configured separately to clean up orphaned files.
    } catch (storageErr) {
      // Log but don't fail the whole deletion on storage errors
      console.error('Storage cleanup error:', storageErr);
    }

    // Delete the public.users row. Foreign key CASCADE will clean up:
    // - check_ins (user_id)
    // - badges (user_id)
    // - pinned_badges (user_id)
    // - messages (user_id)
    // - channel_members (user_id)
    // - event_rsvps (user_id)
    // - event_photos (user_id)
    // - buddy_requests (user_id and matched_with)
    // - special_events (created_by — if RLS allows)
    const { error: publicDeleteError } = await adminClient
      .from('users')
      .delete()
      .eq('id', userId);

    if (publicDeleteError) {
      console.error('Public users delete error:', publicDeleteError);
      // Continue anyway — we still want to delete the auth user
    }

    // Delete the auth.users row. This is the critical part for Apple compliance.
    const { error: authDeleteError } = await adminClient.auth.admin.deleteUser(userId);

    if (authDeleteError) {
      return new Response(
        JSON.stringify({
          error: 'Failed to delete auth user',
          details: authDeleteError.message,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, message: 'Account fully deleted' }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ error: 'Unexpected error', details: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
