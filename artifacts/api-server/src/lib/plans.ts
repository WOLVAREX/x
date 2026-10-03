import { getSetting, setSetting, setSettings } from "./settings";

export type HostingPlan = { id: string; name: string; days: number; coins: number };
export const DEFAULT_PLANS: HostingPlan[] = [
  { id: "week", name: "1 Week", days: 7, coins: 15 },
  { id: "two-weeks", name: "2 Weeks", days: 14, coins: 25 },
  { id: "month", name: "1 Month", days: 30, coins: 35 },
];
export const DEFAULT_KES_PER_COIN = 2;
const KES_PER_COIN_SETTING = "KES_PER_COIN";

const PLAN_PRICING_VERSION = "kes-per-coin-3";
let planPricingMigration: Promise<void> | null = null;

export async function getKesPerCoin(): Promise<number> {
  const saved = Number(await getSetting(KES_PER_COIN_SETTING));
  return Number.isFinite(saved) && saved >= 0.01 && saved <= 100_000
    ? saved
    : DEFAULT_KES_PER_COIN;
}

export async function getMinimumDepositAmountMinor(): Promise<number> {
  return Math.max(300, Math.ceil((await getKesPerCoin()) * 100));
}

export function kesMinorToCoins(amount: number, kesPerCoin: number): number {
  return Math.floor(amount / (kesPerCoin * 100) + Number.EPSILON * 4);
}

async function migrateSavedPlanPrices(): Promise<void> {
  if (!planPricingMigration) {
    planPricingMigration = (async () => {
      const savedVersion = await getSetting("HOSTING_PLANS_PRICING_VERSION");
      if (savedVersion === PLAN_PRICING_VERSION) return;

      const saved = await getSetting("HOSTING_PLANS");
      if (saved) {
        try {
          const parsed: unknown = JSON.parse(saved);
          if (Array.isArray(parsed)) {
            const repriced = parsed.map((item) => {
              if (!item || typeof item !== "object") return item;
              const plan = item as Record<string, unknown>;
              const days = Number(plan.days);
              const standardPrice =
                (plan.id === "week" && days === 7) ? 15
                  : (plan.id === "two-weeks" && days === 14) ? 25
                    : (plan.id === "month" && days === 30) ? 35
                      : undefined;
              if (standardPrice !== undefined) return { ...plan, coins: standardPrice };

              // Plans saved before the 2 KES/coin rate may still be denominated
              // at the old rate. Preserve custom plans already migrated in v2.
              const coins = Number(plan.coins);
              return Number.isInteger(coins) && coins > 0 && savedVersion !== "kes-per-coin-2"
                ? { ...plan, coins: Math.max(1, Math.round(coins / 2)) }
                : plan;
            });
            await setSetting("HOSTING_PLANS", JSON.stringify(repriced));
          }
        } catch {
          // Keep malformed legacy data untouched; getPlans will use defaults.
        }
      }

      await setSetting("HOSTING_PLANS_PRICING_VERSION", PLAN_PRICING_VERSION);
    })();
  }

  try {
    await planPricingMigration;
  } finally {
    planPricingMigration = null;
  }
}

export async function getPlans(): Promise<HostingPlan[]> {
  try {
    await migrateSavedPlanPrices();
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

export async function savePlans(value: unknown, kesPerCoinValue?: unknown): Promise<HostingPlan[] | null> {
  await migrateSavedPlanPrices();
  if (!Array.isArray(value) || value.length < 1 || value.length > 12) return null;
  const requestedRate = kesPerCoinValue === undefined ? await getKesPerCoin() : Number(kesPerCoinValue);
  const kesPerCoin = Math.round(requestedRate * 100) / 100;
  if (!Number.isFinite(requestedRate) || requestedRate < 0.01 || requestedRate > 100_000 || Math.abs(kesPerCoin - requestedRate) > 1e-8) return null;
  const plans: HostingPlan[] = [];
  for (const item of value) {
    if (!item || typeof item !== "object") return null;
    const plan = item as Record<string, unknown>;
    const id = typeof plan.id === "string" ? plan.id.trim() : "";
    const name = typeof plan.name === "string" ? plan.name.trim() : "";
    const days = Number(plan.days);
    const coins = Number(plan.coins);
    if (!/^[a-z0-9][a-z0-9-]{1,39}$/.test(id) || !name || name.length > 60 || !Number.isInteger(days) || days < 1 || days > 365 || !Number.isInteger(coins) || coins < 1 || coins > 500_000) return null;
    if (plans.some((current) => current.id === id)) return null;
    plans.push({ id, name, days, coins });
  }
  await setSettings({ HOSTING_PLANS: JSON.stringify(plans), [KES_PER_COIN_SETTING]: String(kesPerCoin) });
  return plans;
}
