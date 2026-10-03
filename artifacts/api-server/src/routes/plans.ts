import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/auth";
import { getKesPerCoin, getPlans, savePlans } from "../lib/plans";

const router: IRouter = Router();
const response = async () => {
  const [plans, kesPerCoin] = await Promise.all([getPlans(), getKesPerCoin()]);
  return { plans, kesPerCoin, coinsPerKes: 1 / kesPerCoin, chargeCurrency: "KES" };
};

router.get("/plans", async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await response());
});

router.get("/admin/plans", requireAdmin, async (_req, res): Promise<void> => {
  res.setHeader("Cache-Control", "no-store");
  res.json(await response());
});

router.put("/admin/plans", requireAdmin, async (req, res): Promise<void> => {
  const plans = await savePlans(req.body?.plans, req.body?.kesPerCoin);
  if (!plans) {
    res.status(400).json({ error: "Choose a coin value from KES 0.01 to KES 100,000 and add 1–12 valid plans (1–365 days, 1–500,000 coins)" });
    return;
  }
  res.setHeader("Cache-Control", "no-store");
  res.json(await response());
});

export default router;
