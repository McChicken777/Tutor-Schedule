import { pgTable, varchar, json, timestamp, index } from "drizzle-orm/pg-core";

// Not queried through Drizzle anywhere in the app — connect-pg-simple owns
// this table directly (see ensureSessionTable() in artifacts/api-server's
// app.ts, which creates it idempotently with plain SQL at server startup).
// Declared here purely so drizzle-kit's schema diff recognizes it as
// intentional instead of proposing to drop it as "extraneous" on the next
// publish. Column shapes must match connect-pg-simple's own schema exactly.
export const sessionTable = pgTable(
  "session",
  {
    sid: varchar("sid").primaryKey(),
    sess: json("sess").notNull(),
    expire: timestamp("expire", { precision: 6 }).notNull(),
  },
  (table) => [index("IDX_session_expire").on(table.expire)],
);
