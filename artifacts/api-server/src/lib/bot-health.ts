import type { Deployment } from "@workspace/db";
import { getSetting } from "./settings";

const HEROKU_BASE = "https://api.heroku.com";
const ACCEPT = "application/vnd.heroku+json; version=3";

export interface BotHealth {
  status: "building" | "online" | "offline" | "failed";
  /** Heroku exposes dyno state, not the bot's WhatsApp authentication state. */
  whatsappSessionStatus: "unverified";
  failureReason: string | null;
  dynos: Array<{ name?: string; type?: string; state?: string }>;
  buildStatus: string | null;
  herokuAppMissing: boolean;
}

function health(
  status: BotHealth["status"],
  failureReason: string | null,
  dynos: BotHealth["dynos"],
  buildStatus: string | null,
  herokuAppMissing = false,
): BotHealth {
  return { status, whatsappSessionStatus: "unverified", failureReason, dynos, buildStatus, herokuAppMissing };
}

export async function getBotHealth(deployment: Deployment): Promise<BotHealth> {
  const key = (await getSetting("HEROKU_TEAM_API_KEY")) || (await getSetting("HEROKU_API_KEY"));
  if (!key) throw new Error("Heroku is not configured");
  if (!deployment.herokuAppId) throw new Error("Heroku app is not available yet");

  const headers = { Authorization: `Bearer ${key}`, Accept: ACCEPT, "Content-Type": "application/json" };
  const [dynosResponse, buildsResponse, formationResponse] = await Promise.all([
    fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/dynos`, { headers, signal: AbortSignal.timeout(10_000) }),
    fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/builds`, { headers, signal: AbortSignal.timeout(10_000) }),
    fetch(`${HEROKU_BASE}/apps/${deployment.herokuAppId}/formation`, { headers, signal: AbortSignal.timeout(10_000) }),
  ]);

  if ([dynosResponse, buildsResponse, formationResponse].some((response) => response.status === 404)) {
    return health("failed", "The Heroku app no longer exists", [], null, true);
  }
  for (const [name, response] of [["dynos", dynosResponse], ["builds", buildsResponse], ["formation", formationResponse]] as const) {
    if (!response.ok) throw new Error(`Could not read Heroku ${name} status (${response.status})`);
  }

  const dynos = await dynosResponse.json() as BotHealth["dynos"];
  const builds = await buildsResponse.json() as Array<{ id: string; status: string; created_at?: string }>;
  const formations = await formationResponse.json() as Array<{ type: string; quantity: number }>;
  const latestBuild = [...builds].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0];
  const buildStatus = latestBuild?.status?.toLowerCase() ?? null;
  const failedBuild = ["failed", "errored", "canceled"].includes(buildStatus ?? "");
  const activeBuild = ["pending", "queued", "processing"].includes(buildStatus ?? "");
  const expectedTypes = new Set(formations.filter((formation) => formation.quantity > 0).map((formation) => formation.type));
  const appDynos = dynos.filter((dyno) => dyno.type && expectedTypes.has(dyno.type));
  const dynoStates = appDynos.map((dyno) => (dyno.state ?? "").toLowerCase());
  const starting = dynoStates.some((state) => ["starting", "restarting"].includes(state));

  // A pending build or a starting dyno means Heroku is still changing runtime state.
  if (activeBuild || starting) return health("building", null, dynos, buildStatus);

  // A live dyno is stronger evidence of current service availability than a
  // failed build record, which may belong to a later attempt while an older
  // release is still serving traffic.
  if (dynoStates.includes("up")) return health("online", null, dynos, buildStatus);

  if (failedBuild) return health("failed", "The latest Heroku build failed", dynos, buildStatus);
  if (dynoStates.some((state) => ["crashed", "down"].includes(state)) && expectedTypes.size > 0) {
    return health("failed", "Heroku reports that the configured dyno stopped", dynos, buildStatus);
  }

  // An empty dyno list is not enough evidence to claim that the bot crashed.
  // Report the observed stopped state without starting the failed-app cleanup.
  return health("offline", null, dynos, buildStatus);
}
