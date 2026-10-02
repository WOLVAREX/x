import { Router, type IRouter } from "express";
import { requireAdmin } from "../lib/auth";
import { COINS_PER_KES, getPlans, savePlans } from "../lib/plans";

const router: IRouter = Router();
const response = async () => ({ plans: await getPlans(), coinsPerKes: COINS_PER_KES, chargeCurrency: "KES" });

router.get("/plans", async (_req, res): Promise<void> => {
  res.json(await response());
});

router.get("/admin/plans", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await response());
});

router.put("/admin/plans", requireAdmin, async (req, res): Promise<void> => {
  const plans = await savePlans(req.body?.plans);
  if (!plans) {
    res.status(400).json({ error: "Add 1–12 plans with unique IDs, a name, 1–365 days, and 1–100000 coins" });
    return;
  }
  res.json({ plans, coinsPerKes: COINS_PER_KES, chargeCurrency: "KES" });
});

export default router;
