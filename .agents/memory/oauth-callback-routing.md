---
name: OAuth callback routing
description: Google OAuth callback must redirect to real Wouter paths with query params, not hash-fragment URLs.
---

The Google Calendar OAuth callback in `teacher.ts` (`/admin/calendar/callback`) must redirect to the teacher availability page after completing the flow.

**Why it's tricky:** The callback is a top-level browser navigation — not an SPA fetch. The redirect URL must use a real path that Wouter can match, not a hash fragment. The original code used `/?admin=1#/availability?calendarConnected=1`, which routes to the home page (`HomeRedirect`), which immediately forwards signed-in users to `/dashboard` (student page) — the hash is never read by any component.

**Correct pattern:**
- Server redirects to `/teacher/availability?calendarConnected=1` (real path + real query param)
- `Availability.tsx` reads from `window.location.search`, not `window.location.hash`
- `window.history.replaceState` cleans the query param after reading it

**How to apply:** Any future OAuth callback that needs to land on a specific page must use the Wouter route path (e.g. `/teacher/availability`) with standard query params. Never use hash fragments for server-side redirects — browsers include the hash in navigation but servers never see it, and SPA routers may not process it on redirect.

**Note:** The registered Google redirect URI (`GOOGLE_REDIRECT_URI`) is `/api/admin/calendar/callback` — this is the server-side Express route path, not the frontend route. These are different URLs. Don't rename the Google-registered callback path without updating Google Cloud Console.
