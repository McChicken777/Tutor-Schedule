# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `PORT=5000 pnpm --filter @workspace/api-server run dev` — builds the frontend, bundles the API server, and starts a single process on port 5000 that serves both (frontend static files + `/api/*`). This is the only command you need to run the whole app — there is no separate frontend dev server to start.
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env:
  - `DATABASE_URL` — Postgres connection string
  - `ADMIN_PASSWORD` — password for the `/admin/login` page
  - `SESSION_SECRET` — express-session signing secret
  - `CLERK_PUBLISHABLE_KEY` / `VITE_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — student auth (Clerk)
  - `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` / `GOOGLE_REDIRECT_URI` — Google Calendar OAuth (tutor's calendar sync + Meet links). Client ID/secret come from a Google Cloud OAuth client with the Calendar API enabled; redirect URI must be `<host>/api/admin/calendar/callback` and match what's registered in Google Cloud Console exactly.
  - `TEST_STUDENT_EMAIL` (optional) — a student account matching this email always sees `trialAvailable: true` and `hasSeenTour: false`, regardless of real booking/tour history. For repeatedly testing the trial flow and onboarding tour without touching real data.
  - `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` — web push notifications (chat messages, homework reminders, upcoming-class reminders). Keypair is generated once via `web-push.generateVAPIDKeys()`, not tied to any external account. `VAPID_SUBJECT` is a `mailto:` contact address. `VAPID_PUBLIC_KEY` must also be set frontend-side as `VITE_VAPID_PUBLIC_KEY` (same value). If unset, push sends are silently skipped.
  - `INTERNAL_CRON_SECRET` — shared secret for the `/internal/*` cron-sweep endpoints (homework reminders/cleanup, class reminders), checked via the `X-Internal-Secret` header.

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

_Populate as you build — short repo map plus pointers to the source-of-truth file for DB schema, API contracts, theme files, etc._

## Architecture decisions

_Populate as you build — non-obvious choices a reader couldn't infer from the code (3-5 bullets)._

## Product

_Describe the high-level user-facing capabilities of this app once they exist._

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- Google Calendar sync (`artifacts/api-server/src/lib/calendar.ts`) is already multi-tenant: every helper function takes `teacherId` explicitly, and `calendar_tokens` has a unique `teacher_id` FK (one token row per teacher). The OAuth callback (`/admin/calendar/callback`, un-middleware'd since it's a top-level browser redirect from Google) recovers `teacherId` from a `state` nonce stashed in session during `/calendar/auth`, not from any client param. Don't reintroduce a "the" single-row assumption here.
- Customer login (Clerk `<SignIn>`/`<SignUp>`) vs. calendar OAuth (`/api/calendar/auth`) are two separate Google OAuth flows. Enabling "Sign in with Google" for students is a Clerk Dashboard setting (Social Connections), not a code change. Connecting a teacher's calendar is done from their own Settings/Availability page and requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` to be set.
- Messaging (`messages` table) has no `teacherId` column by design — ownership is mediated entirely through the parent student row (`users.teacherId`), which is unambiguous once a student is linked to a teacher. Every query joins through `users` and filters on `teacherId` there; this is correct and intentional, not a gap to "fix" by adding a column.
- Availability = weekly working hours (`site_settings.weekly_hours`, per-weekday enabled/start/end) intersected with the teacher's Google Calendar free/busy. One-off days off (vacation, appointments) are handled by adding an event to that teacher's Google Calendar, not through the app — there's no separate "block this date" UI, since Calendar already covers it.
- **Multi-tutor signup-code gating**: each teacher has a unique `signupCode` (`teachers.signup_code`, regenerable via their Settings page). A new student is routed to `/link-teacher` before reaching any other student page (gated in `App.tsx`'s `RequireStudentNotBanned`) and must submit a valid code — this sets `users.teacherId` via `POST /student/link-teacher`. There's no more "adopt on first booking"; booking now 403s if `teacherId` is still null. All student-facing catalog/content routes (`/student/lesson-types`, `/student/available-slots`, `/student/site-settings`, `/student/testimonials`, `/student/faqs`) resolve `teacherId` from the caller's own linked teacher server-side — never from a client param — so a student can't see another teacher's data. There is no public (unauthenticated) browsing surface for this data anymore; the old `public.ts` was deleted.
- `testimonials` and `faqs` are per-teacher (`teacher_id` FK, not null), not a shared global list — each tutor manages their own from `/teacher/testimonials` and `/teacher/faqs`. The `/admin/*` versions of these are superadmin moderation-only (`GET`/`PATCH`/`DELETE`, no `POST`).
- After pulling schema changes (new columns/tables), always run `pnpm --filter @workspace/db run push` before starting the server — the app will error on missing columns otherwise.
- The API server (`artifacts/api-server`) serves the frontend's built static files directly (`app.ts`, `express.static` + SPA fallback to `index.html` for any non-`/api` route) — this is a deliberate single-process setup so the whole app is one port/one command to run, instead of relying on Replit's multi-service `router = "application"` routing (declared in `.replit`/`artifact.toml` files, which are now stale relative to how the app actually runs). Its `build` script builds the frontend first (`BASE_PATH=/`) before bundling the backend. If you ever click Replit's "Publish"/Deploy button, check whether it's still trying to deploy the old two-service split — it may need `.replit`'s `[deployment]` section updated to match this single-process model.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
