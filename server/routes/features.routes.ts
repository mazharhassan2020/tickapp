import type { Express } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import {
  getFeatures,
  updateFeatures,
  syncGoogleSheets,
} from "../controllers/features.controller";

export function registerFeaturesRoutes(app: Express) {
  app.get("/api/features", requireAuth, getFeatures);
  app.put("/api/admin/features", requireAuth, requireRole("superadmin"), updateFeatures);
  app.post("/api/admin/google-sheets/sync", requireAuth, requireRole("superadmin"), syncGoogleSheets);
}
