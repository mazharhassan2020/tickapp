/**
 * Tenant scoping helpers.
 *
 * Every tenant is an `admin` user; their `team` members read the admin's data.
 * Almost all business data hangs off a channel (`channels.createdBy`), so the
 * safe way to scope a query is: resolve the caller's owner, look up the channels
 * that owner owns, and constrain the query to those channel ids.
 *
 * A `superadmin` is unscoped.
 *
 * IMPORTANT: an endpoint that only filters by `req.query.channelId` is NOT
 * scoped — a brand-new account sends no channelId and would otherwise see every
 * tenant's rows.
 */
import type { Request } from "express";
import { storage } from "../storage";
import { AppError } from "../middlewares/error.middleware";

export type SessionUser = {
  id: string;
  role?: string | null;
  createdBy?: string | null;
} | undefined;

/** The signed-in user, from the session or the auth middleware. */
export function sessionUser(req: Request): SessionUser {
  return ((req as any).session?.user || (req as any).user) as SessionUser;
}

/** Whose data the caller may see — a team member reads their admin's. */
export function ownerIdOf(user: SessionUser): string | null {
  if (!user) return null;
  return user.role === "team" ? (user.createdBy || user.id) : user.id;
}

/**
 * Channel ids the caller is allowed to read.
 *
 * - superadmin            → `null` (no scoping) unless a channelId is requested
 * - requested channelId   → `[channelId]` after verifying ownership (403 if not)
 * - otherwise             → every channel of the caller's owner (may be `[]`)
 *
 * A `[]` result means "this account owns nothing yet" and callers must return an
 * empty payload rather than running an unscoped query.
 */
export async function scopedChannelIds(
  req: Request,
  requestedChannelId?: string | null
): Promise<string[] | null> {
  const user = sessionUser(req);
  const requested = requestedChannelId ? String(requestedChannelId) : "";

  if (user?.role === "superadmin") {
    return requested ? [requested] : null;
  }

  const ownerId = ownerIdOf(user);
  if (!ownerId) throw new AppError(401, "Not authenticated");

  const owned = await storage.getChannelsByUserId(ownerId);
  const ownedIds = owned.map((c: any) => c.id);

  if (requested) {
    if (!ownedIds.includes(requested)) {
      throw new AppError(403, "Access denied to this channel");
    }
    return [requested];
  }

  return ownedIds;
}
