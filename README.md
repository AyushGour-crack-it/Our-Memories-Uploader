# Our Memories Uploader

This is a standalone, self-contained website dedicated to adding memories to the private diary.

## Connect it to the diary

1. Create the shared Supabase project and apply `backend/diary-schema.sql` from the main website repository: [setup guide](https://github.com/AyushGour-crack-it/Ammu-s-Little-Universe/blob/main/backend/SETUP.md).
2. Put the same Supabase project URL and publishable key used by the main diary in `diary-config.js`.
3. Set `archiveUrl` to the main site's `archive.html` URL.
4. Add this site's Vercel URL to Supabase Auth’s redirect allowlist.

Only use the Supabase publishable key here. Never add a secret or `service_role` key. Invite only the two diary members. Members sign in separately on each site because their browser sessions are kept per-site.
