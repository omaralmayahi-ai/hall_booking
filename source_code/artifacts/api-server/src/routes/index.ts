import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import usersRouter from "./users";
import hallsRouter from "./halls";
import bookingsRouter from "./bookings";
import reviewsRouter from "./reviews";
import maintenanceRouter from "./maintenance";
import notificationsRouter from "./notifications";
import dashboardRouter from "./dashboard";
import settingsRouter from "./settings";
import auditRouter from "./audit";
import publicRouter from "./public";
import featuresRouter from "./features";
import reportsRouter from "./reports";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(usersRouter);
router.use(hallsRouter);
router.use(bookingsRouter);
router.use(reviewsRouter);
router.use(maintenanceRouter);
router.use(notificationsRouter);
router.use(dashboardRouter);
router.use(settingsRouter);
router.use(auditRouter);
router.use(publicRouter);
router.use(featuresRouter);
router.use(reportsRouter);

export default router;
