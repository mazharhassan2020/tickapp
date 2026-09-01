/**
 * Browser push: hand out the VAPID public key and keep each device's
 * subscription. Subscriptions belong to the individual, not the tenant — a push
 * goes to the person's own devices.
 */
import type { Express } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import {
  getPublicKey,
  saveSubscription,
  removeSubscription,
} from "../services/push.service";

export function registerPushRoutes(app: Express) {
  app.get("/api/push/public-key", requireAuth, async (_req, res) => {
    try {
      res.json({ publicKey: await getPublicKey() });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Push is unavailable" });
    }
  });

  app.post("/api/push/subscribe", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any)?.user?.id;
      if (!userId) return res.status(401).json({ error: "Not signed in" });
      await saveSubscription(userId, req.body, req.headers["user-agent"] as string);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not subscribe" });
    }
  });

  app.post("/api/push/unsubscribe", requireAuth, async (req, res) => {
    try {
      const userId = (req.session as any)?.user?.id;
      if (!userId) return res.status(401).json({ error: "Not signed in" });
      await removeSubscription(userId, req.body?.endpoint);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not unsubscribe" });
    }
  });
}
