import { Router, type IRouter } from "express";
import { db, deploymentsTable, templatesTable, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { requireAuth } from "../lib/auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: typeof usersTable.$inferSelect }).user;

  const rows = await db
    .select({ deployment: deploymentsTable, templateName: templatesTable.name, templateThumbnail: templatesTable.thumbnail })
    .from(deploymentsTable)
    .leftJoin(templatesTable, eq(deploymentsTable.templateId, templatesTable.id))
    .where(eq(deploymentsTable.userId, user.id))
    .orderBy(deploymentsTable.createdAt);

  const deployments = rows.map(r => ({
    id: r.deployment.id,
    userId: r.deployment.userId,
    templateId: r.deployment.templateId,
    templateName: r.templateName ?? "Unknown",
    templateThumbnail: r.templateThumbnail ?? null,
    botName: r.deployment.botName,
    herokuAppId: r.deployment.herokuAppId ?? null,
    status: r.deployment.status,
    createdAt: r.deployment.createdAt,
    updatedAt: r.deployment.updatedAt,
  }));

  const onlineCount = deployments.filter(d => d.status === "online").length;
  const offlineCount = deployments.filter(d => d.status === "offline").length;
  const errorCount = deployments.filter(d => d.status === "error").length;

  res.json({
    totalDeployments: deployments.length,
    onlineCount,
    offlineCount,
    errorCount,
    recentDeployments: deployments.slice(-5).reverse(),
  });
});

export default router;
