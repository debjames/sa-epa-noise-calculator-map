/*
 * supabase-config.example.js
 *
 * Copy this file to `supabase-config.js` and fill in the project URL and
 * publishable (anon) API key for your Supabase project. The real
 * `supabase-config.js` is gitignored.
 *
 * The publishable key is SAFE to expose in client-side code — RLS policies
 * gate every write. Only authenticated users whose email is present in the
 * `app_admins` table can insert/update/delete library rows.
 */
window.SUPABASE_CONFIG = {
  url:          'https://YOUR-PROJECT.supabase.co',
  publishable:  'sb_publishable_YOUR_KEY_HERE'
};
