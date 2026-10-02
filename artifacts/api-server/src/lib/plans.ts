import { getSetting, setSetting } from "./settings";

export type HostingPlan = { id: string; name: string; days: number; coins: number };
export const DEFAULT_PLANS: HostingPlan[] = [
  { id: "week", name: "1 Week", days: 7, coins: 6 },
  { id: "two-weeks", name: "2 Weeks", days: 14, coins: 10 },
  { id: "month", name: "1 Month", days: 30, coins: 14 },
];
export const COINS_PER_KES = 5;

export async function getPlans(): Promise<HostingPlan[]> {
  try {
    const saved = await getSetting("HOSTING_PLANS");
    if (!saved) return DEFAULT_PLANS;
    const plans = JSON.parse(saved);
    return Array.isArray(plans) && plans.length ? plans : DEFAULT_PLANS;
  } catch {
    return DEFAULT_PLANS;
  }
}

export async function findPlan(id: unknown): Promise<HostingPlan | undefined> {
  if (typeof id !== "string") return undefined;
  return (await getPlans()).find((plan) => plan.id === id);
}

export async function savePlans(value: unknown): Promise<HostingPlan[] | null> {
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  const plans: HostingPlan[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const plan = item as Record<string, unknown>;
    const id = typeof plan.id === "string" ? plan.id.trim() : "";
    const name = typeof plan.name === "string" ? plan.name.trim() : "";
    const days = Number(plan.days);
    const coins = Number(plan.coins);
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || !name || name.length > 60 || !Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(coins) || coins < 1 || coins > 100_000) return null;
    if (plans.some((current) => current.id === id)) return null;
    plans.push({ id, name, days, coins });
  }
  await setSetting("HOSTING_PLANS", JSON.stringify(plans));
  return plans;
}
