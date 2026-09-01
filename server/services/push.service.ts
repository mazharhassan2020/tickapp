/**
 * Browser push notifications over the Web Push protocol (VAPID).
 *
 * Chosen over FCM because it needs no third-party project: the service worker
 * the panel already ships receives the push directly, and the same code reaches
 * Android Chrome and an installed iOS app (16.4+). On iOS the app must be on
 * the home screen — Safari does not deliver push to a tab.
 */
import webpush from "web-push";
import { and, eq } from "drizzle-orm";
import { db } from "../db";
import { pushConfig, pushSubscriptions } from "@shared/schema";
import { getFirstPanelConfig } from "./panel.config";

let configured: { publicKey: string; privateKey: string; subject: string } | null =
  null;

/**
 * The VAPID identity is generated once and kept in the database, so a redeploy
 * does not invalidate every subscription out there.
 */
async function getVapid() {
  if (configured) return configured;

  const [existing] = await db.select().from(pushConfig).limit(1);
  let row = existing;

  if (!row) {
    const keys = webpush.generateVAPIDKeys();
    const panel: any = await getFirstPanelConfig();
    const subject = panel?.supportEmail
      ? `mailto:${panel.supportEmail}`
      : "mailto:support@example.com";
    [row] = await db
      .insert(pushConfig)
      .values({
        publicKey: keys.publicKey,
        privateKey: keys.privateKey,
        subject,
      })
      .returning();
    console.log("[Push] Generated a VAPID key pair");
  }

  webpush.setVapidDetails(row.subject, row.publicKey, row.privateKey);
  configured = {
    publicKey: row.publicKey,
    privateKey: row.privateKey,
    subject: row.subject,
  };
  return configured;
}

/** The key a browser needs to create a subscription. */
export async function getPublicKey(): Promise<string> {
  return (await getVapid()).publicKey;
}

export interface SubscriptionInput {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

export async function saveSubscription(
  userId: string,
  sub: SubscriptionInput,
  userAgent?: string
) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new Error("Incomplete push subscription");
  }

  // The endpoint identifies the device, and browsers reissue the same one, so
  // re-subscribing updates the row rather than piling up duplicates.
  await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: sub.endpoint,
      p256dh: sub.keys.p256dh,
      auth: sub.keys.auth,
      userAgent: userAgent?.slice(0, 400),
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: sub.keys.p256dh,
        auth: sub.keys.auth,
        userAgent: userAgent?.slice(0, 400),
      },
    });
}

export async function removeSubscription(userId: string, endpoint: string) {
  await db
    .delete(pushSubscriptions)
    .where(
      and(
        eq(pushSubscriptions.userId, userId),
        eq(pushSubscriptions.endpoint, endpoint)
      )
    );
}

export interface PushPayload {
  title: string;
  body: string;
  /** Where clicking the notification should land. */
  url?: string;
  /** Collapses repeats of the same conversation into one notification. */
  tag?: string;
}

/**
 * Deliver to every device a person has registered. Never throws: a push that
 * cannot be sent must not break whatever triggered it.
 */
export async function sendPushToUser(userId: string, payload: PushPayload) {
  try {
    await getVapid();

    const subs = await db
      .select()
      .from(pushSubscriptions)
      .where(eq(pushSubscriptions.userId, userId));
    if (subs.length === 0) return;

    const panel: any = await getFirstPanelConfig();
    const icon = panel?.appIcon || panel?.favicon || panel?.logo || undefined;
    const body = JSON.stringify({ ...payload, icon });

    await Promise.all(
      subs.map(async (sub) => {
        try {
          await webpush.sendNotification(
            {
              endpoint: sub.endpoint,
              keys: { p256dh: sub.p256dh, auth: sub.auth },
            },
            body
          );
          await db
            .update(pushSubscriptions)
            .set({ lastUsedAt: new Date() })
            .where(eq(pushSubscriptions.id, sub.id));
        } catch (err: any) {
          // 404/410 mean the browser dropped the subscription for good — a
          // reinstalled app or revoked permission. Stop trying that endpoint.
          const status = err?.statusCode;
          if (status === 404 || status === 410) {
            await db
              .delete(pushSubscriptions)
              .where(eq(pushSubscriptions.id, sub.id));
          } else {
            console.error("[Push] Failed to deliver:", status, err?.message);
          }
        }
      })
    );
  } catch (err: any) {
    console.error("[Push] sendPushToUser failed:", err?.message || err);
  }
}
