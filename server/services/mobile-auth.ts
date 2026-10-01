/**
 * ============================================================
 * © 2025 Diploy — a brand of Bisht Technologies Private Limited
 * Original Author: BTPL Engineering Team
 * Website: https://diploy.in
 * Contact: cs@diploy.in
 *
 * Distributed under the Envato / CodeCanyon License Agreement.
 * Licensed to the purchaser for use as defined by the
 * Envato Market (CodeCanyon) Regular or Extended License.
 *
 * You are NOT permitted to redistribute, resell, sublicense,
 * or share this source code, in whole or in part.
 * Respect the author's rights and Envato licensing terms.
 * ============================================================
 */

/**
 * Token authentication for native mobile clients.
 *
 * The web panel uses a session cookie that expires 24h after login and is
 * never refreshed. That is fine in a browser but would sign a phone out every
 * day, so mobile clients trade credentials once for:
 *
 *   - an access token: a short-lived JWT, sent as `Authorization: Bearer <jwt>`
 *   - a refresh token: a long-lived opaque secret, exchanged for a new pair
 *
 * The access token deliberately carries nothing but the user id. Roles and
 * permissions are re-read from the database on every request, so revoking a
 * permission takes effect at once instead of when the token happens to expire.
 *
 * Refresh tokens are stored only as a SHA-256 hash, and rotate on every use:
 * redeeming one issues a replacement and marks the old row used. Presenting an
 * already-used token therefore means it leaked, and we revoke that device's
 * whole chain rather than silently issuing another pair.
 */

import crypto from "crypto";
import jwt from "jsonwebtoken";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { db, dbRead } from "../db";
import { users, mobileRefreshTokens } from "@shared/schema";
import { resolveUserPermissions } from "../utils/role-permissions";

/** Short, so a leaked access token is useful only briefly. */
const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
/** Long, so a daily-driver app is not constantly asking for a password. */
const REFRESH_TOKEN_TTL_DAYS = 60;
const ISSUER = "tickai-mobile";

export interface MobileTokenPair {
  accessToken: string;
  refreshToken: string;
  /** Seconds until `accessToken` expires. */
  expiresIn: number;
  tokenType: "Bearer";
}

export interface DeviceInfo {
  deviceName?: string | null;
  platform?: string | null;
}

/**
 * The signing key.
 *
 * Falls back to SESSION_SECRET so an existing deployment needs no new
 * environment variable; set MOBILE_JWT_SECRET to rotate mobile tokens
 * independently of web sessions.
 */
function signingSecret(): string {
  const secret = process.env.MOBILE_JWT_SECRET || process.env.SESSION_SECRET;
  if (!secret || secret === "your-secret-key-change-in-production") {
    throw new Error(
      "Refusing to issue mobile tokens: set MOBILE_JWT_SECRET or SESSION_SECRET to a strong random value."
    );
  }
  return secret;
}

function sha256(value: string): string {
  return crypto.createHash("sha256").update(value).digest("hex");
}

/** The session-user shape the rest of the app expects on `req.user`. */
export function toAuthUser(user: typeof users.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role,
    permissions: resolveUserPermissions(user.role, user.permissions as any),
    avatar: user.avatar,
    createdBy: user.createdBy || "",
  };
}

export function signAccessToken(userId: string): string {
  return jwt.sign({ sub: userId, typ: "access" }, signingSecret(), {
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    issuer: ISSUER,
  });
}

/**
 * Verify an access token and load the current user.
 *
 * Returns null for anything unusable — bad signature, expired, wrong issuer,
 * deleted user, or an account that has since been deactivated.
 */
export async function authenticateAccessToken(token: string) {
  let payload: any;
  try {
    payload = jwt.verify(token, signingSecret(), { issuer: ISSUER });
  } catch {
    return null;
  }
  if (!payload || payload.typ !== "access" || typeof payload.sub !== "string") {
    return null;
  }

  const rows = await dbRead
    .select()
    .from(users)
    .where(eq(users.id, payload.sub))
    .limit(1);
  const user = rows[0];
  if (!user) return null;
  if ((user.status || "").trim().toLowerCase() !== "active") return null;

  return toAuthUser(user);
}

/** Issue a fresh pair and persist the refresh token's hash. */
export async function issueTokenPair(
  userId: string,
  device: DeviceInfo = {}
): Promise<MobileTokenPair> {
  const refreshToken = crypto.randomBytes(48).toString("base64url");
  const expiresAt = new Date(
    Date.now() + REFRESH_TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000
  );

  await db.insert(mobileRefreshTokens).values({
    userId,
    tokenHash: sha256(refreshToken),
    deviceName: device.deviceName?.slice(0, 200) || null,
    platform: device.platform?.slice(0, 20) || null,
    expiresAt,
  });

  return {
    accessToken: signAccessToken(userId),
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
    tokenType: "Bearer",
  };
}

export type RefreshOutcome =
  | { ok: true; tokens: MobileTokenPair }
  | { ok: false; reason: "invalid" | "expired" | "reused" | "inactive" };

/**
 * Exchange a refresh token for a new pair, rotating it.
 *
 * A token that was already redeemed is treated as a compromise: every refresh
 * token for that user is revoked, forcing a fresh login on all their devices.
 */
export async function rotateRefreshToken(
  refreshToken: string,
  device: DeviceInfo = {}
): Promise<RefreshOutcome> {
  const hash = sha256(refreshToken);

  const rows = await db
    .select()
    .from(mobileRefreshTokens)
    .where(eq(mobileRefreshTokens.tokenHash, hash))
    .limit(1);
  const row = rows[0];
  if (!row) return { ok: false, reason: "invalid" };

  if (row.revokedAt) {
    // Already redeemed or explicitly revoked, yet presented again.
    await revokeAllForUser(row.userId);
    return { ok: false, reason: "reused" };
  }
  if (row.expiresAt.getTime() <= Date.now()) {
    return { ok: false, reason: "expired" };
  }

  const userRows = await dbRead
    .select()
    .from(users)
    .where(eq(users.id, row.userId))
    .limit(1);
  const user = userRows[0];
  if (!user || (user.status || "").trim().toLowerCase() !== "active") {
    return { ok: false, reason: "inactive" };
  }

  await db
    .update(mobileRefreshTokens)
    .set({ revokedAt: new Date(), lastUsedAt: new Date() })
    .where(eq(mobileRefreshTokens.id, row.id));

  const tokens = await issueTokenPair(row.userId, {
    deviceName: device.deviceName ?? row.deviceName,
    platform: device.platform ?? row.platform,
  });
  return { ok: true, tokens };
}

/** Revoke a single device's token (sign-out on that phone). */
export async function revokeRefreshToken(refreshToken: string): Promise<void> {
  await db
    .update(mobileRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mobileRefreshTokens.tokenHash, sha256(refreshToken)),
        isNull(mobileRefreshTokens.revokedAt)
      )
    );
}

/** Revoke every device for a user (password change, or a detected replay). */
export async function revokeAllForUser(userId: string): Promise<void> {
  await db
    .update(mobileRefreshTokens)
    .set({ revokedAt: new Date() })
    .where(
      and(
        eq(mobileRefreshTokens.userId, userId),
        isNull(mobileRefreshTokens.revokedAt)
      )
    );
}

/**
 * Drop rows that can never be redeemed again.
 *
 * Revoked rows are kept for a grace period so a replayed token is still
 * recognised as a reuse rather than silently reading as "invalid".
 */
export async function pruneExpiredRefreshTokens(): Promise<void> {
  const graceCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  await db
    .delete(mobileRefreshTokens)
    .where(
      or(
        lt(mobileRefreshTokens.expiresAt, graceCutoff),
        lt(mobileRefreshTokens.revokedAt, graceCutoff)
      )
    );
}
