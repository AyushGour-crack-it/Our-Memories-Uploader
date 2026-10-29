// Supabase's project URL and publishable key are safe to use in the browser
// when the row-level security policies in backend/diary-schema.sql are applied.
// Never put a Supabase secret/service-role key in this file.
window.DIARY_CONFIG = {
  supabaseUrl: 'https://mjiypmhzrnfmvdbeajpr.supabase.co',
  publishableKey: 'sb_publishable_5fvonpYreMJ60HC50TN0-w_ngjp3MAx',
  // Set this to the deployed main diary page URL, for example https://our-site.vercel.app/archive.html
  archiveUrl: 'https://dear-ammu-xi.vercel.app/archive.html',
};
