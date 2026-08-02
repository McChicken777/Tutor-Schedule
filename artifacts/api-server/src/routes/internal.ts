import { Router, type IRouter } from "express";
import { requireCronSecret } from "../middlewares/requireCronSecret";
import { runHomeworkReminders, runHomeworkFilesCleanup } from "../lib/scheduledJobs";

const router: IRouter = Router();

router.post("/internal/homework-reminders/run", requireCronSecret, async (_req, res): Promise<void> => {
  const result = await runHomeworkReminders();
  res.json(result);
});

router.post("/internal/homework-files-cleanup/run", requireCronSecret, async (_req, res): Promise<void> => {
  const result = await runHomeworkFilesCleanup();
  res.json(result);
});

export default router;
