import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studentRouter from "./student";
import teachersRouter from "./teachers";
import teacherRouter from "./teacher";
import adminRouter from "./admin";
import uploadsRouter from "./uploads";
import filesRouter from "./files";
import internalRouter from "./internal";
import pushRouter from "./push";

const router: IRouter = Router();

router.use(healthRouter);
router.use(internalRouter);
router.use(studentRouter);
router.use(teachersRouter);
router.use(teacherRouter);
router.use(adminRouter);
router.use(uploadsRouter);
router.use(filesRouter);
router.use(pushRouter);

export default router;
