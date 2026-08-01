import { Router, type IRouter } from "express";
import healthRouter from "./health";
import publicRouter from "./public";
import studentRouter from "./student";
import teachersRouter from "./teachers";
import adminRouter from "./admin";
import uploadsRouter from "./uploads";
import filesRouter from "./files";
import internalRouter from "./internal";

const router: IRouter = Router();

router.use(healthRouter);
router.use(internalRouter);
router.use(publicRouter);
router.use(studentRouter);
router.use(teachersRouter);
router.use(adminRouter);
router.use(uploadsRouter);
router.use(filesRouter);

export default router;
