import { db, settingsTable } from "@workspace/db";
import { eq } from "drizzle-orm";

const settings = new Map<string, string>();
let settingsTableAvailable = true;

export async function loadSettingsFromDb(): Promise<void> {
  try {
    const rows = await db.select().from(settingsTable);
    settingsTableAvailable = true;
    settings.clear();
    for (const row of rows) settings.set(row.key, row.value);
  } catch (error) {
    const code = (error as { cause?: { code?: string } }).cause?.code;
    if (code !== "42P01") throw error;
    settingsTableAvailable = false;
    console.warn("Database settings table is missing; settings will be kept in memory for this run.");
  }
}

export async function getSetting(key: string): Promise<string> {
  const cached = settings.get(key);
  if (cached !== undefined) return cached;
  if (!settingsTableAvailable) return process.env[key] ?? "";

  const [row] = await db
    .select({ value: settingsTable.value })
    .from(settingsTable)
    .where(eq(settingsTable.key, key));
  if (!row) return "";
  settings.set(key, row.value);
  return row.value;
}

export async function setSetting(key: string, value: string): Promise<void> {
  await setSettings({ [key]: value });
}

export async function setSettings(values: Record<string, string>): Promise<void> {
  if (settingsTableAvailable) {
    await db.transaction(async (tx) => {
      for (const [key, value] of Object.entries(values)) {
        await tx
          .insert(settingsTable)
          .values({ key, value })
          .onConflictDoUpdate({ target: settingsTable.key, set: { value } });
      }
    });
  }
  for (const [key, value] of Object.entries(values)) settings.set(key, value);
}
