import { sql } from "drizzle-orm";
import { db, deploymentsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

function timestamped(line: string): string {
  return `[${new Date().toISOString()}] ${line}`;
}

export async function appendDeploymentLogs(deploymentId: number, lines: string[]): Promise<void> {
  if (lines.length === 0) return;
  const entries = lines.map(timestamped);
  const values = sql.join(entries.map((line) => sql`${line}`), sql`, `);
  await db.update(deploymentsTable)
    .set({ logs: sql`array_cat(coalesce(${deploymentsTable.logs}, ARRAY[]::text[]), ARRAY[${values}]::text[])` })
    .where(eq(deploymentsTable.id, deploymentId));
}

export async function appendDeploymentLog(deploymentId: number, line: string): Promise<void> {
  await appendDeploymentLogs(deploymentId, [line]);
}
