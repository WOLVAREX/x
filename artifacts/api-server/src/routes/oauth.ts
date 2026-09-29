import { Router, type IRouter } from "express";
import passport from "passport";
import { Strategy as GoogleStrategy } from "passport-google-oauth20";
import { Strategy as GitHubStrategy } from "passport-github2";
import { db, usersTable } from "@workspace/db";
import { eq, or } from "drizzle-orm";
import { signToken } from "../lib/auth";

const router: IRouter = Router();

const FRONTEND_URL = process.env.FRONTEND_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:5000";
const BACKEND_URL = process.env.BACKEND_URL ?? process.env.RENDER_EXTERNAL_URL ?? "http://localhost:8080";

// ── Google Strategy ──────────────────────────────────────────
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(
    new GoogleStrategy(
      {
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${BACKEND_URL}/api/auth/google/callback`,
      },
      async (_accessToken, _refreshToken, profile, done) => {
        try {
          const email = profile.emails?.[0]?.value ?? "";
          const avatarUrl = profile.photos?.[0]?.value ?? "";

          // Check if user exists by googleId or email
          const [existing] = await db
            .select()
            .from(usersTable)
            .where(or(eq(usersTable.googleId, profile.id), eq(usersTable.email, email)));

          if (existing) {
            // Update googleId and avatar if missing
            const [updated] = await db
              .update(usersTable)
              .set({ googleId: profile.id, avatarUrl })
              .where(eq(usersTable.id, existing.id))
              .returning();
            return done(null, updated);
          }

          // Create new user
          const username = (profile.displayName ?? email.split("@")[0])
            .replace(/\s+/g, "_")
            .toLowerCase()
            .slice(0, 30);

          const [user] = await db
            .insert(usersTable)
            .values({
              username: `${username}_${Date.now().toString().slice(-4)}`,
              email,
              passwordHash: null,
              role: "user",
              googleId: profile.id,
              avatarUrl,
            })
            .returning();

          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
} else {
  console.warn("GOOGLE_CLIENT_ID or GOOGLE_CLIENT_SECRET not set — Google OAuth disabled.");
}

// ── GitHub Strategy ──────────────────────────────────────────
if (process.env.GITHUB_CLIENT_ID && process.env.GITHUB_CLIENT_SECRET) {
  passport.use(
    new GitHubStrategy(
      {
        clientID: process.env.GITHUB_CLIENT_ID,
        clientSecret: process.env.GITHUB_CLIENT_SECRET,
        callbackURL: `${BACKEND_URL}/api/auth/github/callback`,
        scope: ["user:email"],
      },
      async (_accessToken: string, _refreshToken: string, profile: any, done: any) => {
        try {
          const email =
            profile.emails?.find((e: any) => e.primary)?.value ??
            profile.emails?.[0]?.value ??
            `${profile.username}@github.local`;
          const avatarUrl = profile.photos?.[0]?.value ?? "";

          const [existing] = await db
            .select()
            .from(usersTable)
            .where(or(eq(usersTable.githubId, profile.id.toString()), eq(usersTable.email, email)));

          if (existing) {
            const [updated] = await db
              .update(usersTable)
              .set({ githubId: profile.id.toString(), avatarUrl })
              .where(eq(usersTable.id, existing.id))
              .returning();
            return done(null, updated);
          }

          const username = (profile.username ?? email.split("@")[0]).slice(0, 30);

          const [user] = await db
            .insert(usersTable)
            .values({
              username: `${username}_${Date.now().toString().slice(-4)}`,
              email,
              passwordHash: null,
              role: "user",
              githubId: profile.id.toString(),
              avatarUrl,
            })
            .returning();

          return done(null, user);
        } catch (err) {
          return done(err as Error);
        }
      }
    )
  );
} else {
  console.warn("GITHUB_CLIENT_ID or GITHUB_CLIENT_SECRET not set — GitHub OAuth disabled.");
}

// ── Google Routes ─────────────────────────────────────────────
router.get(
  "/auth/google",
  passport.authenticate("google", { scope: ["profile", "email"], session: false })
);

router.get(
  "/auth/google/callback",
  passport.authenticate("google", { session: false, failureRedirect: `${FRONTEND_URL}/login?error=google_failed` }),
  (req, res) => {
    const user = req.user as typeof usersTable.$inferSelect;
    const token = signToken(user.id, user.role);
    res.redirect(`${FRONTEND_URL}/oauth-callback?token=${token}`);
  }
);

// ── GitHub Routes ─────────────────────────────────────────────
router.get(
  "/auth/github",
  passport.authenticate("github", { scope: ["user:email"], session: false })
);

router.get(
  "/auth/github/callback",
  passport.authenticate("github", { session: false, failureRedirect: `${FRONTEND_URL}/login?error=github_failed` }),
  (req, res) => {
    const user = req.user as typeof usersTable.$inferSelect;
    const token = signToken(user.id, user.role);
    res.redirect(`${FRONTEND_URL}/oauth-callback?token=${token}`);
  }
);

export default router;
