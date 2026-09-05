/**
 * Connecting a WhatsApp number costs us money on every message, so it is gated
 * behind a live subscription. Both channel-create paths (manual add and
 * embedded signup) go through here.
 */
import { and, eq, gt, isNull, or } from "drizzle-orm";
import { dbRead } from "../db";
import { subscriptions } from "@shared/schema";

export const NO_PLAN_MESSAGE =
  "You need an active plan before you can connect a WhatsApp channel. Please choose a plan first.";

/**
 * True when the account has a subscription marked active — the same definition
 * the rest of the app uses (API middleware, plans page, channel allowance).
 *
 * A Stripe trial counts: checkout verification stores status "active" and keeps
 * the raw "trialing" in gatewayStatus, so a 7-day trial has full access before
 * the first charge.
 */
export async function hasActiveSubscription(userId: string): Promise<boolean> {
  if (!userId) return false;

  const [row] = await dbRead
    .select({ id: subscriptions.id })
    .from(subscriptions)
    .where(
      and(
        eq(subscriptions.userId, userId),
        eq(subscriptions.status, "active"),
        // A row whose period has passed is not active, whatever the column
        // says — the expiry sweep may not have run yet, and a missed gateway
        // webhook must never leave someone with free access.
        or(isNull(subscriptions.endDate), gt(subscriptions.endDate, new Date()))
      )
    )
    .limit(1);

  return !!row;
}
