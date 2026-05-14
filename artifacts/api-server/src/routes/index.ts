import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import projectsRouter from "./projects";
import dashboardRouter from "./dashboard";
import aiRouter from "./ai";
import leadsRouter from "./leads";
import estimatingRouter from "./estimating";
import notificationsRouter from "./notifications";
import contractorsRouter from "./contractors";
import auditRouter from "./audit";
import integrationsRouter from "./integrations";
import adminSecretsRouter from "./admin-secrets";
import permitsChecklistRouter from "./permits-checklist";
import contractorMonitoringRouter from "./contractor-monitoring";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(projectsRouter);
router.use(dashboardRouter);
router.use(aiRouter);
router.use(leadsRouter);
router.use(estimatingRouter);
router.use(notificationsRouter);
router.use(contractorsRouter);
router.use(auditRouter);
router.use(integrationsRouter);
router.use(adminSecretsRouter);
// P6.1 + P6.2 — Session 3 modules.
router.use(permitsChecklistRouter);
router.use(contractorMonitoringRouter);

export default router;
