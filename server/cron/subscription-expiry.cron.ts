/**
 * Retires subscriptions whose paid period has run out.
 *
 * Everything that decides what an account may do reads `subscriptions.status`,
 * and nothing was ever moving a finished subscription off "active" — that was
 * left entirely to Stripe's webhooks. When those are not delivered (the
 * endpoint had been sitting disabled), a cancelled plan stayed active forever
 * and the customer kept full access without paying. A date the database already
 * holds should not need a third party to be believed.
 */
import { and, eq, lt } from "drizzle-orm";
import { db } from "../db";
import { subscriptions } from "@shared/schema";

const INTERVAL_MS = 15 * 60 * 1000;

async function sweep(): Promise<number> {
  const expired = await db
    .update(subscriptions)
    .set({ status: "expired", autoRenew: false, updatedAt: new Date() })
    .where(
      and(
        eq(subscriptions.status, "active"),
        lt(subscriptions.endDate, new Date())
      )
    )
    .returning({ id: subscriptions.id, userId: subscriptions.userId });

  if (expired.length > 0) {
    console.log(
      `[SubscriptionExpiry] Expired ${expired.length} subscription(s): ${expired
        .map((s) => s.id)
        .join(", ")}`
    );
  }
  return expired.length;
}

export const subscriptionExpiry = {
  start() {
    // Once at boot so a restart also clears anything missed while down.
    void sweep().catch((err) =>
      console.error("[SubscriptionExpiry] Initial sweep failed:", err)
    );

    const timer = setInterval(() => {
      void sweep().catch((err) =>
        console.error("[SubscriptionExpiry] Sweep failed:", err)
      );
    }, INTERVAL_MS);
    timer.unref?.();

    console.log("✅ Subscription expiry cron started");
  },
  sweep,
};
