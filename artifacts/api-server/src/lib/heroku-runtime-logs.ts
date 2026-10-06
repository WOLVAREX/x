const HEROKU_BASE = "https://api.heroku.com";

export async function fetchHerokuRuntimeLogs(appName: string, headers: Record<string, string>, lines = 100): Promise<string[]> {
  const sessionResponse = await fetch(`${HEROKU_BASE}/apps/${appName}/log-sessions`, {
    method: "POST",
    headers,
    body: JSON.stringify({ lines, tail: false }),
    signal: AbortSignal.timeout(10_000),
  });
  const session = await sessionResponse.json().catch(() => ({})) as { logplex_url?: string; message?: string };
  if (!sessionResponse.ok) {
    throw new Error(`Heroku log session request failed (${sessionResponse.status}): ${session.message ?? sessionResponse.statusText}`);
  }
  if (!session.logplex_url) throw new Error("Heroku did not return a Logplex URL");

  let logplexUrl: URL;
  try {
    logplexUrl = new URL(session.logplex_url);
  } catch {
    throw new Error("Heroku returned an invalid Logplex URL");
  }
  if (logplexUrl.protocol !== "https:" || logplexUrl.hostname !== "logplex.heroku.com") {
    throw new Error("Heroku returned an unexpected Logplex host");
  }

  const logsResponse = await fetch(logplexUrl, { signal: AbortSignal.timeout(15_000), cache: "no-store" });
  if (!logsResponse.ok) throw new Error(`Heroku Logplex request failed (${logsResponse.status})`);
  const logsText = await logsResponse.text();
  return logsText.split(/\r?\n/).filter((line) => line.length > 0);
}
