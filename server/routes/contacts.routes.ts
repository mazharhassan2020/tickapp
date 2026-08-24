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

import type { Express } from "express";
import { diployLogger, HTTP_STATUS, DIPLOY_BRAND } from "@diploy/core";
import * as contactsController from "../controllers/contacts.controller";
import { validateRequest } from "../middlewares/validation.middleware";
import { insertContactSchema , PERMISSIONS } from "@shared/schema";
import { extractChannelId } from "../middlewares/channel.middleware";
import { db } from "../db";
import { contacts } from "@shared/schema";
import { eq } from "drizzle-orm";
import { requireAuth, requirePermission } from "../middlewares/auth.middleware";
import { requireSubscription } from "server/middlewares/requireSubscription";

export function registerContactRoutes(app: Express) {
  // Get all contacts
  app.get("/api/contacts-all", 
  requireAuth,
  requirePermission(PERMISSIONS.CONTACTS_VIEW),
    extractChannelId,
    contactsController.getContacts
  );

  app.get("/api/contacts", 
  requireAuth,
  requirePermission(PERMISSIONS.CONTACTS_VIEW),
    extractChannelId,
    contactsController.getContactsWithPagination
  );

  // Get single contact
  app.get("/api/contacts/:id", requireAuth,
  requirePermission(PERMISSIONS.CONTACTS_VIEW), contactsController.getContact);

  // Create contact
  app.post("/api/contacts",
    extractChannelId, requireAuth,
    requirePermission(PERMISSIONS.CONTACTS_CREATE),requireSubscription('contacts'),
    validateRequest(insertContactSchema), 
    contactsController.createContact
  );


  app.get("/api/user/contacts/:userId", requireAuth, contactsController.getContactsByUser);

  // Update contact
  app.put(
    "/api/contacts/:id",
    requireAuth,
    requirePermission(PERMISSIONS.CONTACTS_EDIT),
    contactsController.updateContact
  );

  // Toggle opt-in
  app.patch(
    "/api/contacts/:id/opt-in",
    requireAuth,
    async (req, res) => {
      try {
        const { id } = req.params;
        const { optIn } = req.body;
        const result = await db
          .update(contacts)
          .set({ optIn: optIn === true, updatedAt: new Date() })
          .where(eq(contacts.id, id))
          .returning();
        if (result.length === 0) return res.status(404).json({ error: "Contact not found" });
        res.json({ success: true, optIn: result[0].optIn });
      } catch (e) {
        console.error("Opt-in toggle error:", e);
        res.status(500).json({ error: "Failed to update opt-in" });
      }
    }
  );

  // Delete contact
  app.delete(
    "/api/contacts/:id",
    requireAuth,
    requirePermission(PERMISSIONS.CONTACTS_DELETE),
    contactsController.deleteContact
  );

  // Delete Bulk contact
  app.delete(
    "/api/contacts-bulk",
    requireAuth,
    requirePermission(PERMISSIONS.CONTACTS_DELETE),
    contactsController.deleteBulkContacts
  );

  // Import contacts
  app.post(
    "/api/contacts/import",
    requireAuth,
    requirePermission(PERMISSIONS.CONTACTS_EXPORT), // or CONTACTS_IMPORT if you defined it
    extractChannelId,requireSubscription('contacts'),
    contactsController.importContacts
  );
}