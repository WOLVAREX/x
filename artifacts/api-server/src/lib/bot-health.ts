import type { Deployment } from "@workspace/db";
import { getSetting } from "./settings";

const HEROKU_BASE = "https://api.heroku.com";
const ACCEPT = "application/vnd.heroku+json; version=3";

export interface BotHealth {
  status: "building" | "online" | "offline" | "failed";
  failureReason: string | null;
  dynos: Array<{ name?: string; type?: string; state?: string }>;
  buildStatus: string | null;
  herokuAppMissing: boolean;
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
  if (dynosResponse.status === 404 || formationResponse.status === 404) {
    return { status: "failed", failureReason: "The Heroku app no longer exists", dynos: [], buildStatus: null, herokuAppMissing: true };
  }
  if (!dynosResponse.ok) throw new Error("Could not read Heroku dyno status");
  const dynos = await dynosResponse.json() as BotHealth["dynos"];
  const builds = buildsResponse.ok ? await buildsResponse.json() as Array<{ id: string; status: string; created_at?: string }> : [];
  const formations = formationResponse.ok ? await formationResponse.json() as Array<{ type: string; quantity: number }> : [];
  const latestBuild = [...builds].sort((a, b) => new Date(b.created_at ?? 0).getTime() - new Date(a.created_at ?? 0).getTime())[0];
  const buildStatus = latestBuild?.status?.toLowerCase() ?? null;
  const dynoStates = dynos.map((dyno) => (dyno.state ?? "").toLowerCase());
  const isBuilding = dynoStates.some((state) => ["starting", "restarting"].includes(state)) || ["pending", "queued", "processing"].includes(buildStatus ?? "");

  if (["failed", "errored", "canceled"].includes(buildStatus ?? "")) {
    return { status: "failed", failureReason: "The Heroku build failed", dynos, buildStatus, herokuAppMissing: false };
  }
  if (isBuilding) return { status: "building", failureReason: null, dynos, buildStatus, herokuAppMissing: false };

  if (dynoStates.includes("up")) {
    const alreadyFailedForLogout = deployment.status === "failed" && /logged.?out/i.test(deployment.failureReason ?? "");
    const logout = alreadyFailedForLogout || await findSessionLogout(
      deployment.herokuAppId,
      headers,
      deployment.status === "failed" ? undefined : deployment.updatedAt,
    );
    if (logout) return { status: "failed", failureReason: "The bot session appears to be logged out", dynos, buildStatus, herokuAppMissing: false };
    return { status: "online", failureReason: null, dynos, buildStatus, herokuAppMissing: false };
  }

  const expectedDynos = formations.some((formation) => formation.quantity > 0);
  if (expectedDynos) return { status: "failed", failureReason: "The bot process stopped unexpectedly", dynos, buildStatus, herokuAppMissing: false };
  if (deployment.status === "failed" || deployment.status === "error") {
    return { status: "failed", failureReason: deployment.failureReason ?? "The bot deployment failed", dynos, buildStatus, herokuAppMissing: false };
  }
  return { status: "offline", failureReason: null, dynos, buildStatus, herokuAppMissing: false };
}

async function findSessionLogout(appName: string, headers: Record<string, string>, since?: Date): Promise<boolean> {
  try {
    const sessionResponse = await fetch(`${HEROKU_BASE}/apps/${appName}/log-sessions`, {
      method: "POST", headers, body: JSON.stringify({ lines: 100, tail: false }), signal: AbortSignal.timeout(10_000),
    });
    if (!sessionResponse.ok) return false;
    const session = await sessionResponse.json() as { logplex_url?: string };
    if (!session.logplex_url) return false;
    const logsResponse = await fetch(session.logplex_url, { signal: AbortSignal.timeout(10_000) });
    if (!logsResponse.ok) return false;
    const logoutSignal = /logged[\s_-]*out|logout|disconnectreason\.loggedout|session (?:is )?(?:invalid|expired|closed)|invalid session|authentication failed|auth failure|not authenticated|device (?:was )?removed|401.{0,30}unauthori[sz]ed|statuscode.{0,8}401/;
    const logs = (await logsResponse.text()).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
    return logs.split("\n").some((line) => {
      if (!logoutSignal.test(line.toLowerCase())) return false;
      if (!since) return true;
      const timestamp = line.match(/(?:^|\s)(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:?\d{2}))/)?.[1];
      const loggedAt = timestamp ? Date.parse(timestamp) : Number.NaN;
      return !Number.isFinite(loggedAt) || loggedAt >= since.getTime();
    });
  } catch {
    return false;
  }
}
