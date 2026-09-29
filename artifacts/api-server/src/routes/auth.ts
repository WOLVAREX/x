import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { signToken, requireAuth } from "../lib/auth";

const router: IRouter = Router();
router.post("/auth/register", async (req, res): Promise<void> => {
  const body = req.body.data ?? req.body;
  const { username, email, password } = body;
  if (!username || !email || !password) {
    res.status(400).json({ error: "username, email and password are required" });
    return;
  }
  if (username.length < 3) {
    res.status(400).json({ error: "Username must be at least 3 characters" });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" });
    return;
  }

  const existing = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already registered" });
    return;
  }

const passwordHash = await bcrypt.hash(password, 10);
const [user] = await db.insert(usersTable).values({
  username,
  email,
  passwordHash,
  role: "user",
}).returning();

  const token = signToken(user.id, user.role);
  res.status(201).json({
    user: { id: user.id, username: user.username, email: user.email, role: user.role, createdAt: user.createdAt },
    token,
  });
});


 

router.post("/auth/login", async (req, res): Promise<void> => {
  const body = req.body.data ?? req.body;
  const { email, password } = body;
   if (!email || !password) {
    res.status(400).json({ error: "Email and password are required" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.email, email));
  if (!user?.passwordHash) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  const token = signToken(user.id, user.role);
  res.json({
    user: { id: user.id, username: user.username, email: user.email, role: user.role, createdAt: user.createdAt },
    token,
  });
});

router.post("/auth/logout", (_req, res): void => {
  res.json({ success: true });
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const user = (req as typeof req & { user: typeof usersTable.$inferSelect }).user;
  res.json({
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
  });
});

export default router;
