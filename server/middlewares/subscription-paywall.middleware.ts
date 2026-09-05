/**
 * Locks the API for an account whose plan has run out.
 *
 * The screen-level guard only stops the panel from rendering; the endpoints
 * behind it stayed open, so an expired account still had a working product
 * through any client that talked to the API directly. This closes that: every
 * /api route refuses, except the handful needed to sign in, see that the plan
 * lapsed, and buy a new one — locking someone out of paying would be worse than
 * letting them browse.
 */
import type { NextFunction, Request, Response } from "express";
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { dbRead } from "../db";
import { subscriptions } from "@shared/schema";

/** Paths that must work without a plan, matched as prefixes. */
const OPEN_PREFIXES = [
  // Session, branding and the bits the shell renders itself from.
  "/api/auth",
  "/api/csrf-token",
  "/api/brand-settings",
  "/api/platform-settings",
  "/api/panel",
  "/api/features",
  "/api/languages",
  "/api/platform-languages",
  "/api/translations",
  "/api/notifications/unread-count",

  // Seeing the state of the subscription, and ending it.
  "/api/subscriptions",

  // Choosing and paying for a plan.
  "/api/admin/plans",
  "/api/plans",
  "/api/payment",
  "/api/payment-providers",
  "/api/transactions",
  "/api/wallet",

  // Their own profile, so the account stays manageable.
  "/api/users/me",
  "/api/user/profile",
];

/** Cached briefly: this runs on every API call. */
const cache = new Map<string, { active: boolean; checkedAt: number }>();
const CACHE_MS = 30_000;

async function ownerHasPlan(ownerId: string): Promise<boolean> {
  const hit = cache.get(ownerId);
  if (hit && Date.now() - hit.checkedAt < CACHE_MS) return hit.active;

  const [row] = await dbRead
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, ownerId),
        eq(subscriptions.status, "active"),
        or(isNull(subscriptions.endDate), gt(subscriptions.endDate, new Date()))
      )
    )
    .limit(1);

  const active = !!row;
  cache.set(ownerId, { active, checkedAt: Date.now() });
  return active;
}

/** Called after a purchase so access resumes without waiting out the cache. */
export function clearPaywallCache(ownerId?: string) {
  if (ownerId) cache.delete(ownerId);
  else cache.clear();
}

export async function subscriptionPaywall(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    if (!req.path.startsWith("/api/")) return next();
    if (OPEN_PREFIXES.some((p) => req.path.startsWith(p))) return next();

    const user = (req.session as any)?.user;
    // Anonymous traffic is handled by the usual auth guards, and a superadmin
    // runs the platform rather than subscribing to it.
    if (!user || user.role === "superadmin") return next();

    const ownerId = user.role === "team" ? user.createdBy : user.id;
    if (!ownerId) return next();

    if (await ownerHasPlan(ownerId)) return next();

    return res.status(402).json({
      error: "Your plan has expired. Choose a plan to continue.",
      reason: "subscription_required",
    });
  } catch (err) {
    // A database hiccup must not lock paying customers out of their own account.
    console.error("[Paywall] Check failed, allowing request:", err);
    next();
  }
}
