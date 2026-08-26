import path from "node:path";
import express, { type Express } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { pool } from "@workspace/db";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";
import router from "./routes";
import { apiNotFound, errorHandler } from "./middlewares/errorHandler";
import { logger } from "./lib/logger";

// The frontend's built static assets — served by this same process so the
// whole app is a single port/process (no separate frontend server to route to).
const FRONTEND_DIST = path.join(import.meta.dirname, "../../spanish-tutor/dist/public");

const app: Express = express();

// The deployed app sits behind a reverse proxy that terminates HTTPS — the
// Node process itself only ever sees plain HTTP. Without this, Express's
// req.secure is always false in production, and express-session silently
// refuses to persist a `cookie.secure: true` session over what it perceives
// as an insecure connection — which is exactly what broke the Google
// Calendar OAuth state check with no exception ever thrown to catch.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// Clerk proxy must be before body parsers
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());

app.use(cors({ credentials: true, origin: true }));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Session for admin auth and the Google Calendar OAuth handshake. Backed by
// Postgres (not express-session's default in-memory store) because the
// in-memory store doesn't survive a deploy landing the OAuth callback on a
// different server instance (or a restarted one) than the request that
// started the flow — which silently broke calendar connection in production.
//
// Deliberately NOT using connect-pg-simple's own `createTableIfMissing` —
// it reads its schema from a `table.sql` file it expects to sit next to its
// own code at runtime, which esbuild's single-file bundle doesn't carry
// along, so that path throws ENOENT in the built app. Creating the table
// ourselves with plain SQL sidesteps it entirely.
async function ensureSessionTable(): Promise<void> {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS "session" (
      "sid" varchar NOT NULL COLLATE "default",
      "sess" json NOT NULL,
      "expire" timestamp(6) NOT NULL
    ) WITH (OIDS=FALSE);
  `);
  await pool.query(`
    DO $$
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'session_pkey') THEN
        ALTER TABLE "session" ADD CONSTRAINT "session_pkey" PRIMARY KEY ("sid") NOT DEFERRABLE INITIALLY IMMEDIATE;
      END IF;
    END $$;
  `);
  await pool.query(`CREATE INDEX IF NOT EXISTS "IDX_session_expire" ON "session" ("expire");`);
}
ensureSessionTable().catch((err) => logger.error({ err }, "Failed to ensure session table exists"));

const PgSession = connectPgSimple(session);
app.use(
  session({
    store: new PgSession({ pool, tableName: "session" }),
    secret: process.env.SESSION_SECRET || "dev-secret-change-in-prod",
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      maxAge: 24 * 60 * 60 * 1000, // 24 hours
    },
  }),
);

// Clerk middleware — resolves publishable key from host for multi-domain support
app.use(
  clerkMiddleware((req) => ({
    publishableKey: publishableKeyFromHost(
      getClerkProxyHost(req) ?? "",
      process.env.CLERK_PUBLISHABLE_KEY,
    ),
  })),
);

app.use("/api", router);
app.use("/api", apiNotFound);

// Serve the built frontend for everything else, falling through to index.html
// for client-side routes (wouter) that don't correspond to a real file.
app.use(express.static(FRONTEND_DIST));
app.use((req, res, next) => {
  if (req.method !== "GET" || req.path.startsWith("/api")) {
    next();
    return;
  }
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

// Must be last — Express only treats a 4-arg middleware as an error handler.
app.use(errorHandler);

export default app;
