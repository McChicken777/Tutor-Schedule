import app from "./app";
import { logger } from "./lib/logger";
import { seed } from "./lib/seed";
import { startScheduledJobs } from "./lib/scheduledJobs";

// Without these, a rejected promise or a throw outside a request handler kills
// the process with a bare V8 trace and no logger context — which is exactly the
// case that's hardest to diagnose from a deployment log.
process.on("unhandledRejection", (reason) => {
  logger.error({ err: reason }, "Unhandled promise rejection");
});

process.on("uncaughtException", (err) => {
  logger.fatal({ err }, "Uncaught exception — shutting down");
  process.exit(1);
});

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");

  seed().catch((e) => logger.error({ err: e }, "Seed failed"));
  startScheduledJobs();
});
