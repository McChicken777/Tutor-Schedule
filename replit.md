# [Project name]

_Replace the heading above with the project's name, and this line with one sentence describing what this app does for users._

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
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

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
