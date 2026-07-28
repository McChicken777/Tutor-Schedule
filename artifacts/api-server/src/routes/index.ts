import { Router, type IRouter } from "express";
import healthRouter from "./health";
import publicRouter from "./public";
import studentRouter from "./student";
import adminRouter from "./admin";

const router: IRouter = Router();

router.use(healthRouter);
router.use(publicRouter);
router.use(studentRouter);
router.use(adminRouter);

export default router;
