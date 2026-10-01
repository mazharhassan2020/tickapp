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

import { requireAuth, requireRole } from "server/middlewares/auth.middleware";
import { diployLogger, HTTP_STATUS, DIPLOY_BRAND } from "@diploy/core";
import type { Express } from "express";
import {
  registerDeviceToken,
  unregisterDeviceToken,
  isFcmConfigured,
} from "../services/fcm.service";
import {
  adminCreateNotification,
  adminGetNotifications,
  adminSendNotification,
  userGetNotifications,
  userMarkAsRead,
  userUnreadCount,
  userMarkAllRead,
  getNotificationTemplates,
  updateNotificationTemplate,
  getUserPreferences,
  updateUserPreference,
  deleteNotification,
} from "../controllers/notification.controller";

export function registerNotificationsRoutes(app: Express) {
  app.post("/api/notifications", requireAuth, adminCreateNotification);

  // Send
  app.post("/api/notifications/:id/send", requireAuth, adminSendNotification);

  // List all
  app.get("/api/notifications/", requireAuth,  adminGetNotifications);

  // List all user notifications
  app.get("/api/notifications/users/", requireAuth,  userGetNotifications);

  // Mark as read
  app.post("/api/notifications/:id/read", requireAuth, userMarkAsRead);
 
  // Mark all read
  app.post("/api/notifications/mark-all", requireAuth, userMarkAllRead);

  // Unread count
  app.get("/api/notifications/unread-count", requireAuth, userUnreadCount);

  app.get("/api/notification-templates", requireAuth, getNotificationTemplates);
  app.put("/api/notification-templates/:id", requireAuth, requireRole("superadmin"), updateNotificationTemplate);

  // User notification preferences
  app.get("/api/notification-preferences", requireAuth, getUserPreferences);
  app.put("/api/notification-preferences", requireAuth, updateUserPreference);

  // Delete a sent notification
  app.delete("/api/notifications/:id", requireAuth, deleteNotification);

  // ────────────────────────────────────────────────────────
  // Native app device tokens (FCM / APNs)
  //
  // The browser subscribes to Web Push through the service worker; a native
  // build cannot, so it posts its FCM registration token here instead.
  // ────────────────────────────────────────────────────────

  app.post("/api/device-tokens", requireAuth, async (req, res) => {
    const user = (req as any).user;
    const { token, platform, deviceName } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token is required" });
    }
    try {
      await registerDeviceToken({
        userId: user.id,
        token,
        platform,
        deviceName,
      });
      // Tell the client whether pushes can actually be delivered, so it can
      // stop asking the user for a permission that leads nowhere.
      res.json({ registered: true, pushConfigured: await isFcmConfigured() });
    } catch (err) {
      console.error("[device-tokens] register failed:", (err as Error).message);
      res.status(500).json({ error: "Could not register this device" });
    }
  });

  app.delete("/api/device-tokens", requireAuth, async (req, res) => {
    const { token } = req.body || {};
    if (!token || typeof token !== "string") {
      return res.status(400).json({ error: "token is required" });
    }
    try {
      await unregisterDeviceToken(token);
      res.json({ unregistered: true });
    } catch (err) {
      console.error("[device-tokens] unregister failed:", (err as Error).message);
      res.status(500).json({ error: "Could not unregister this device" });
    }
  });
  
}
