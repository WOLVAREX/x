import { Router, type IRouter } from "express";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { requireAdmin } from "../lib/auth";
import { getSetting, setSetting } from "../lib/settings";

export type TeamLink = { label: string; url: string };
export type TeamMember = {
  id: string;
  name: string;
  role: string;
  bio: string;
  imageUrl: string | null;
  links: TeamLink[];
};

const router: IRouter = Router();
const TEAM_SETTING = "TEAM_MEMBERS";
const uploadDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../junex/uploads/team");
const imageTypes = {
  "image/jpeg": { extension: "jpg", signature: (bytes: Buffer) => bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff },
  "image/png": { extension: "png", signature: (bytes: Buffer) => bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) },
  "image/webp": { extension: "webp", signature: (bytes: Buffer) => bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP" },
} as const;

async function readMembers(): Promise<TeamMember[]> {
  const value = await getSetting(TEAM_SETTING);
  if (!value) return [];
  try {
    const members = JSON.parse(value);
    return Array.isArray(members) ? members : [];
  } catch {
    return [];
  }
}

function validatedMember(value: unknown, id = randomUUID()): TeamMember | null {
  if (!value || typeof value !== "object") return null;
  const body = value as Record<string, unknown>;
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const role = typeof body.role === "string" ? body.role.trim() : "";
  const bio = typeof body.bio === "string" ? body.bio.trim() : "";
  const imageUrl = body.imageUrl === null || body.imageUrl === "" ? null : body.imageUrl;
  if (!name || name.length > 100 || !role || role.length > 120 || bio.length > 1000) return null;
  if (imageUrl !== null && (typeof imageUrl !== "string" || !/^\/uploads\/team\/[a-f0-9-]+\.(jpg|png|webp)$/.test(imageUrl))) return null;

  const linksInput = Array.isArray(body.links) ? body.links : [];
  if (linksInput.length > 12) return null;
  const links: TeamLink[] = [];
  for (const item of linksInput) {
    if (!item || typeof item !== "object") return null;
    const link = item as Record<string, unknown>;
    const label = typeof link.label === "string" ? link.label.trim() : "";
    const url = typeof link.url === "string" ? link.url.trim() : "";
    if (!label && !url) continue;
    if (!label || label.length > 40 || url.length > 500) return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== "https:" && parsed.protocol !== "http:") return null;
    } catch {
      return null;
    }
    links.push({ label, url });
  }

  return { id, name, role, bio, imageUrl: imageUrl as string | null, links };
}

async function removeUploadedImage(imageUrl: string | null | undefined) {
  if (!imageUrl) return;
  const name = path.basename(imageUrl);
  if (!/^[a-f0-9-]+\.(jpg|png|webp)$/.test(name)) return;
  await unlink(path.join(uploadDir, name)).catch(() => {});
}

router.get("/team", async (_req, res): Promise<void> => {
  res.json(await readMembers());
});

router.get("/admin/team", requireAdmin, async (_req, res): Promise<void> => {
  res.json(await readMembers());
});

router.post("/admin/team/image", requireAdmin, async (req, res): Promise<void> => {
  const contentType = req.body?.contentType as keyof typeof imageTypes;
  const encoded = req.body?.data as unknown;
  const imageType = imageTypes[contentType];
  if (!imageType || typeof encoded !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(encoded)) {
    res.status(400).json({ error: "Upload a PNG, JPEG, or WebP image" });
    return;
  }
  const bytes = Buffer.from(encoded, "base64");
  if (!bytes.length || bytes.length > 1_500_000 || !imageType.signature(bytes)) {
    res.status(400).json({ error: "Image must be a valid PNG, JPEG, or WebP under 1.5 MB" });
    return;
  }
  await mkdir(uploadDir, { recursive: true });
  const fileName = `${randomUUID()}.${imageType.extension}`;
  await writeFile(path.join(uploadDir, fileName), bytes, { flag: "wx" });
  res.status(201).json({ imageUrl: `/uploads/team/${fileName}` });
});

router.put("/admin/team", requireAdmin, async (req, res): Promise<void> => {
  const current = await readMembers();
  const incoming = Array.isArray(req.body?.members) ? req.body.members : null;
  if (!incoming || incoming.length > 50) {
    res.status(400).json({ error: "Provide up to 50 team members" });
    return;
  }
  const members: TeamMember[] = [];
  for (const value of incoming) {
    const requestedId = value && typeof value.id === "string" ? value.id : randomUUID();
    if (!/^[a-f0-9-]{36}$/.test(requestedId) || members.some((member) => member.id === requestedId)) {
      res.status(400).json({ error: "Invalid or duplicate team member id" });
      return;
    }
    const member = validatedMember(value, requestedId);
    if (!member) {
      res.status(400).json({ error: "Check each member's name, role, bio, photo, and links" });
      return;
    }
    members.push(member);
  }
  await setSetting(TEAM_SETTING, JSON.stringify(members));
  const retainedImages = new Set(members.map((member) => member.imageUrl).filter(Boolean));
  await Promise.all(current.filter((member) => member.imageUrl && !retainedImages.has(member.imageUrl)).map((member) => removeUploadedImage(member.imageUrl)));
  res.json(members);
});

export default router;
