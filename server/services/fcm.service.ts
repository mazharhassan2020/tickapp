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
 * Push notifications to the native mobile apps, via FCM's HTTP v1 API.
 *
 * This sits alongside `push.service.ts` rather than replacing it: that one
 * speaks Web Push (VAPID) and reaches browsers and installed PWAs, which a
 * native iOS build cannot receive. Both are dispatched from the same place in
 * notification.service.ts, so a user with the panel open in a tab and the app
 * on their phone gets one alert in each.
 *
 * Credentials come from the `firebase_config` row (a Google service account),
 * so the deployment is configured through the panel rather than env vars. With
 * no row, or an incomplete one, every call here is a silent no-op - a missing
 * Firebase project must not break message delivery.
 *
 * The v1 API is addressed per-token (the legacy batch endpoint is retired), so
 * a user with several devices costs one request each. That is fine at this
 * scale and keeps the per-token error handling simple: FCM reports a dead
 * token individually, and we disable exactly that row.
 */

import { and, eq, isNull } from "drizzle-orm";
import { JWT } from "google-auth-library";
import { db, dbRead } from "../db";
import { deviceTokens, firebaseConfig } from "@shared/schema";

export interface FcmPayload {
  title: string;
  body: string;
  /** Opaque data for the app: which conversation to open, mostly. */
  data?: Record<string, string>;
  /** Collapses previous notifications for the same conversation. */
  tag?: string;
}

interface ServiceAccount {
  projectId: string;
  clientEmail: string;
  privateKey: string;
}

let cachedAccount: ServiceAccount | null = null;
let cachedClient: JWT | null = null;

/**
 * Read the service account from the database.
 *
 * Cached after the first successful read; a config change needs a restart,
 * which matches how the rest of the panel's provider settings behave.
 */
async function serviceAccount(): Promise<ServiceAccount | null> {
  if (cachedAccount) return cachedAccount;

  const [row] = await dbRead.select().from(firebaseConfig).limit(1);
  if (!row) return null;

  const projectId = (row.projectId || "").trim();
  const clientEmail = (row.clientEmail || "").trim();
  // Pasted into a form, the PEM usually arrives with literal \n sequences.
  const privateKey = (row.privateKey || "").replace(/\\n/g, "\n").trim();

  if (!projectId || !clientEmail || !privateKey) return null;

  cachedAccount = { projectId, clientEmail, privateKey };
  return cachedAccount;
}

async function authClient(account: ServiceAccount): Promise<JWT> {
  if (cachedClient) return cachedClient;
  cachedClient = new JWT({
    email: account.clientEmail,
    key: account.privateKey,
    scopes: ["https://www.googleapis.com/auth/firebase.messaging"],
  });
  return cachedClient;
}

/** True when a Firebase service account is configured. */
export async function isFcmConfigured(): Promise<boolean> {
  return (await serviceAccount()) !== null;
}

/**
 * Store (or move) a device token.
 *
 * Upserts on the token itself: FCM hands the same token to whichever install
 * owns it, so a token arriving for a different user means the device changed
 * hands and the row should follow.
 */
export async function registerDeviceToken(params: {
  userId: string;
  token: string;
  platform?: string | null;
  deviceName?: string | null;
}): Promise<void> {
  const token = params.token.trim();
  if (!token) return;

  await db
    .insert(deviceTokens)
    .values({
      token,
      userId: params.userId,
      platform: params.platform?.slice(0, 20) || null,
      deviceName: params.deviceName?.slice(0, 200) || null,
      lastSeenAt: new Date(),
    })
    .onConflictDoUpdate({
      target: deviceTokens.token,
      set: {
        userId: params.userId,
        platform: params.platform?.slice(0, 20) || null,
        deviceName: params.deviceName?.slice(0, 200) || null,
        lastSeenAt: new Date(),
        // A token being re-registered is alive again.
        disabledAt: null,
      },
    });
}

/** Forget a device token (sign-out on that phone). */
export async function unregisterDeviceToken(token: string): Promise<void> {
  const trimmed = token.trim();
  if (!trimmed) return;
  await db.delete(deviceTokens).where(eq(deviceTokens.token, trimmed));
}

async function disableToken(token: string): Promise<void> {
  await db
    .update(deviceTokens)
    .set({ disabledAt: new Date() })
    .where(eq(deviceTokens.token, token));
}

/**
 * Send to every live device a user has registered.
 *
 * Never throws: it is called with `void` from the notification fan-out, and a
 * push failure must not interfere with storing or delivering the message
 * itself.
 */
export async function sendFcmToUser(
  userId: string,
  payload: FcmPayload
): Promise<void> {
  try {
    const account = await serviceAccount();
    if (!account) return; // Firebase not configured; nothing to do.

    const rows = await dbRead
      .select()
      .from(deviceTokens)
      .where(
        and(eq(deviceTokens.userId, userId), isNull(deviceTokens.disabledAt))
      );
    if (rows.length === 0) return;

    const client = await authClient(account);
    const url =
      `https://fcm.googleapis.com/v1/projects/${account.projectId}/messages:send`;

    for (const row of rows) {
      const message = {
        message: {
          token: row.token,
          // `notification` lets the OS display the alert while the app is in
          // the background or closed, which is the whole point.
          notification: { title: payload.title, body: payload.body },
          data: payload.data ?? {},
          android: {
            priority: "HIGH",
            notification: {
              // Collapse per conversation, the way a chat app should.
              tag: payload.tag,
              sound: "default",
            },
          },
          apns: {
            headers: {
              "apns-priority": "10",
              ...(payload.tag ? { "apns-collapse-id": payload.tag } : {}),
            },
            payload: {
              aps: {
                sound: "default",
                // Lets the app badge and update while backgrounded.
                "mutable-content": 1,
                "content-available": 1,
              },
            },
          },
        },
      };

      try {
        await client.request({ url, method: "POST", data: message });
      } catch (err: any) {
        const status = err?.response?.status;
        const reason =
          err?.response?.data?.error?.details?.[0]?.errorCode ||
          err?.response?.data?.error?.status;

        // UNREGISTERED/NOT_FOUND means the app was deleted or the token was
        // rotated. Keep the row but mark it dead so it stops being retried.
        if (status === 404 || reason === "UNREGISTERED" || status === 400) {
          await disableToken(row.token);
          console.warn("[fcm] token disabled after", status, reason || "");
          continue;
        }
        console.error("[fcm] send failed:", status, reason || err?.message);
      }
    }
  } catch (err) {
    console.error("[fcm] dispatch error:", (err as Error).message);
  }
}
