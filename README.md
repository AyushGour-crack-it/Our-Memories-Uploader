# Our Memories Uploader

This is a standalone, self-contained website dedicated to adding memories to the private diary.

## Install it on a phone

The uploader is an installable Progressive Web App (PWA). On Android, open it in Chrome and choose **Install app**; after it is installed, sharing photos, videos, and voice notes from another app can open the uploader directly. The share target queues the selected files only in this browser's local IndexedDB while they are reviewed; uploaded media is sent to the existing private Supabase bucket. The queue expires after 24 hours and is removed file by file as uploads complete.

On iPhone, open the site in a browser and use its Share menu → **Add to Home Screen**. iPhone PWAs cannot currently register as a target in the iOS Share menu, so use **Add a memory** inside the installed uploader to select multiple photos, videos, or audio files. Both platforms retain the normal website URL and in-app file picker.

The service worker caches only the app shell for loading/offline messaging. It does not cache diary media, Supabase auth requests, or signed media URLs. Uploads need an internet connection.

## Connect it to the diary

1. Create the shared Supabase project and apply `backend/diary-schema.sql` from the main website repository: [setup guide](https://github.com/AyushGour-crack-it/Ammu-s-Little-Universe/blob/main/backend/SETUP.md).
2. Put the same Supabase project URL and publishable key used by the main diary in `diary-config.js`.
3. Set `archiveUrl` to the main site's `archive.html` URL.
4. Add this site's Vercel URL to Supabase Auth’s redirect allowlist.

Only use the Supabase publishable key here. Never add a secret or `service_role` key. Invite only the two diary members. Members sign in separately on each site because their browser sessions are kept per-site.

## Upload behavior

Videos and files at least 6 MB use Supabase's TUS resumable upload protocol with 6 MB chunks, progress reporting, and automatic retries for interrupted connections. Smaller photos use the regular upload path with a safe retry and a check for files that arrived even when the browser lost the response. All files remain limited to 50 MB by the uploader and the private bucket.

Choose **little thing** to write an envelope note directly in the form: give it a title, date, and message; no attachment is needed. Voice notes are checked by their content hash and exact repeats are blocked across both diary accounts. Older voice notes are also checked by filename and file size.

An optional place name can be added to a memory; it is entered manually and the uploader never requests GPS access. A batch shares that place across its individual memory cards. Before using the location field with the live database, run [`supabase-migrations/20261031_memories_location.sql`](supabase-migrations/20261031_memories_location.sql) in the Supabase SQL Editor. The matching migration and diary display update are in the main website repository.
