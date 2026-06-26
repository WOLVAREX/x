import { Router, type IRouter } from "express";
import passport from "passport";
import healthRouter from "./health";
import authRouter from "./auth";
import oauthRouter from "./oauth";
import templatesRouter from "./templates";
import deploymentsRouter from "./deployments";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import paymentsRouter from "./payments";
import walletRouter from "./wallet";

const router: IRouter = Router();

router.use(passport.initialize());
router.use(healthRouter);
router.use(authRouter);
router.use(oauthRouter);
router.use(templatesRouter);
router.use(deploymentsRouter);
router.use(dashboardRouter);
router.use(adminRouter);
router.use(paymentsRouter);
router.use(walletRouter);

export default router;
