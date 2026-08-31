/**
 * Endpoints behind "Import from WhatsApp group": link a WhatsApp account by QR,
 * read its groups, and read one group's members.
 *
 * A session belongs to the individual who scanned, not to the tenant: these are
 * personal WhatsApp accounts, and sharing one across a company would let any
 * team member read their admin's private groups. Everyone links their own
 * device, and imported contacts still land in the tenant's shared segments.
 */
import type { Express } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import {
  startSession,
  getSessionState,
  listGroups,
  listGroupMembers,
  closeSession,
} from "../services/whatsapp-web.service";

function sessionKeyOf(req: any): string {
  return req.session?.user?.id;
}

export function registerWhatsAppWebRoutes(app: Express) {
  // Start (or reuse) a link and hand back the QR to scan.
  app.post("/api/whatsapp-web/session", requireAuth, async (req, res) => {
    try {
      const ownerId = sessionKeyOf(req);
      if (!ownerId) return res.status(401).json({ error: "Not signed in" });
      await startSession(ownerId);
      res.json(getSessionState(ownerId));
    } catch (err: any) {
      console.error("[WA-Web] Failed to start session:", err?.message || err);
      res.status(500).json({
        error: err?.message || "Could not start a WhatsApp session",
      });
    }
  });

  // Polled by the dialog while the QR is on screen.
  app.get("/api/whatsapp-web/session", requireAuth, (req, res) => {
    const ownerId = sessionKeyOf(req);
    if (!ownerId) return res.status(401).json({ error: "Not signed in" });
    res.json(getSessionState(ownerId));
  });

  app.delete("/api/whatsapp-web/session", requireAuth, async (req, res) => {
    try {
      const ownerId = sessionKeyOf(req);
      if (!ownerId) return res.status(401).json({ error: "Not signed in" });
      await closeSession(ownerId);
      res.json({ status: "disconnected" });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "Could not disconnect" });
    }
  });

  app.get("/api/whatsapp-web/groups", requireAuth, async (req, res) => {
    try {
      const ownerId = sessionKeyOf(req);
      if (!ownerId) return res.status(401).json({ error: "Not signed in" });
      res.json({ groups: await listGroups(ownerId) });
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not read groups" });
    }
  });

  app.get("/api/whatsapp-web/groups/:id/members", requireAuth, async (req, res) => {
    try {
      const ownerId = sessionKeyOf(req);
      if (!ownerId) return res.status(401).json({ error: "Not signed in" });
      res.json(await listGroupMembers(ownerId, req.params.id));
    } catch (err: any) {
      res.status(400).json({ error: err?.message || "Could not read members" });
    }
  });
}
