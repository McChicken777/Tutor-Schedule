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

- Google Calendar sync (`artifacts/api-server/src/lib/calendar.ts`) is single-tenant: `calendar_tokens` is expected to hold at most one row (the tutor's OAuth tokens), and all the calendar helper functions read/update "the" row without a student/user id. Don't reuse this table for per-student calendars.
- Customer login (Clerk `<SignIn>`/`<SignUp>`) vs. calendar OAuth (`/api/calendar/auth`) are two separate Google OAuth flows. Enabling "Sign in with Google" for students is a Clerk Dashboard setting (Social Connections), not a code change. Connecting the tutor's calendar is done from Admin → Settings and requires `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET`/`GOOGLE_REDIRECT_URI` to be set.
- Messaging (`messages` table) is one thread per student, single-teacher: rows are keyed only by `studentId`, there's no `teacherId`/conversation concept. If this ever becomes multi-teacher, this table needs a teacher/conversation dimension before it'll work correctly — don't just add teachers without revisiting it.
- Availability = weekly working hours (`site_settings.weekly_hours`, per-weekday enabled/start/end) intersected with the tutor's Google Calendar free/busy. One-off days off (vacation, appointments) are handled by adding an event to her Google Calendar, not through the app — there's no separate "block this date" UI, since Calendar already covers it.
- After pulling schema changes (new columns/tables), always run `pnpm --filter @workspace/db run push` before starting the server — the app will error on missing columns otherwise.
- The API server (`artifacts/api-server`) serves the frontend's built static files directly (`app.ts`, `express.static` + SPA fallback to `index.html` for any non-`/api` route) — this is a deliberate single-process setup so the whole app is one port/one command to run, instead of relying on Replit's multi-service `router = "application"` routing (declared in `.replit`/`artifact.toml` files, which are now stale relative to how the app actually runs). Its `build` script builds the frontend first (`BASE_PATH=/`) before bundling the backend. If you ever click Replit's "Publish"/Deploy button, check whether it's still trying to deploy the old two-service split — it may need `.replit`'s `[deployment]` section updated to match this single-process model.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
