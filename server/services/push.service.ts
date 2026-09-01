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

/**
 * The push endpoint is supplied by the client and the server later POSTs to it,
 * which makes an unchecked value a request-forgery hole: a signed-in user could
 * register an address on our own network and have every new message poke it.
 *
 * Web Push endpoints only ever come from a handful of browser vendors, so the
 * host is matched against that list, and anything pointing inside a network is
 * refused outright.
 */
const ALLOWED_PUSH_HOSTS = [
  /(^|\.)googleapis\.com$/, // Chrome / Chromium
  /(^|\.)push\.services\.mozilla\.com$/, // Firefox
  /(^|\.)notify\.windows\.com$/, // Edge / Windows
  /(^|\.)push\.apple\.com$/, // Safari, incl. installed iOS apps
];

const PRIVATE_HOST = new RegExp(
  [
    "^localhost$",
    "^127\\.", // loopback
    "^10\\.", // RFC1918
    "^192\\.168\\.",
    "^172\\.(1[6-9]|2\\d|3[01])\\.",
    "^169\\.254\\.", // link-local, incl. cloud metadata
    "^0\\.",
    "^\\[?::1\\]?$",
    "^\\[?f[cd][0-9a-f]{2}:", // unique-local IPv6
    "^\\[?fe80:", // link-local IPv6
  ].join("|"),
  "i"
);

function assertPushEndpointAllowed(endpoint: string): void {
  let parsed: URL;
  try {
    parsed = new URL(endpoint);
  } catch {
    throw new Error("Invalid push endpoint");
  }

  if (parsed.protocol !== "https:") {
    throw new Error("Push endpoint must use HTTPS");
  }

  const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
  if (PRIVATE_HOST.test(host)) {
    throw new Error("Push endpoint host is not allowed");
  }
  if (!ALLOWED_PUSH_HOSTS.some((re) => re.test(host))) {
    // Logged rather than silently dropped: a new browser vendor would show up
    // here first, and the list can then be widened deliberately.
    console.warn(`[Push] Refused subscription for unknown host: ${host}`);
    throw new Error("Push endpoint host is not recognised");
  }
}

export async function saveSubscription(
  userId: string,
  sub: SubscriptionInput,
  userAgent?: string
) {
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth) {
    throw new Error("Incomplete push subscription");
  }

  assertPushEndpointAllowed(sub.endpoint);

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
