import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { compare, hash } from "bcryptjs";
import { db } from "@/lib/db";
import { AppError } from "@/lib/errors";
import { hasPermission, type Permission } from "@/lib/permissions";

export const SESSION_COOKIE = "inventory_session";
export const publicUserSelect = { id: true, name: true, email: true, role: true, isActive: true, createdAt: true, updatedAt: true } as const;
const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");
const loginAttempts = new Map<string, { attempts: number; reset: number }>();

export async function currentUser() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token || token.length !== 64) return null;
  const session = await db.session.findUnique({ where: { tokenHash: hashToken(token) }, include: { user: { select: publicUserSelect } } });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) return null;
  return session.user;
}

export async function requireUser(permission?: Permission) {
  const user = await currentUser();
  if (!user) throw new AppError("Please sign in to continue", 401);
  if (permission && !hasPermission(user.role, permission)) throw new AppError("You do not have permission to perform this action", 403);
  return user;
}

export async function login(email: string, password: string, rememberMe = false) {
  const key = email.toLowerCase();
  const now = Date.now();
  if (loginAttempts.size > 5000) for (const [k, v] of loginAttempts) if (v.reset < now) loginAttempts.delete(k);
  const attempt = loginAttempts.get(key);
  if (attempt && attempt.reset > now && attempt.attempts >= 10) throw new AppError("Too many login attempts. Try again in 15 minutes.", 429);
  const user = await db.user.findUnique({ where: { email: key } });
  // A fixed valid bcrypt hash keeps unknown-account requests computationally comparable.
  const valid = await compare(password, user?.passwordHash || "$2b$12$LQv3c1yqBWVHxkd0LHAkCOYg6Ttx1TG1iyjI1.DZrpCUefUuNmIW2");
  if (!user || !user.isActive || !valid) {
    loginAttempts.set(key, { attempts: attempt && attempt.reset > now ? attempt.attempts + 1 : 1, reset: attempt && attempt.reset > now ? attempt.reset : now + 900000 });
    throw new AppError("Invalid email or password", 401);
  }
  loginAttempts.delete(key);
  const token = randomBytes(32).toString("hex");
  const seconds = rememberMe ? 30 * 86400 : 12 * 3600;
  const jar = await cookies();
  const old = jar.get(SESSION_COOKIE)?.value;
  if (old) await db.session.deleteMany({ where: { tokenHash: hashToken(old) } });
  await db.session.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt: new Date(now + seconds * 1000) } });
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: seconds });
  return { id: user.id, name: user.name, email: user.email, role: user.role, isActive: user.isActive };
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.session.deleteMany({ where: { tokenHash: hashToken(token) } });
  jar.delete(SESSION_COOKIE);
}

export const hashPassword = (password: string) => hash(password, 12);

