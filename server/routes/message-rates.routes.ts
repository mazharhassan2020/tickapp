import type { Express } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import * as c from "../controllers/message-rates.controller";

export function registerMessageRatesRoutes(app: Express) {
  const admin = [requireAuth, requireRole("superadmin")];
  app.get("/api/admin/message-rates", ...admin, c.listRates);
  app.post("/api/admin/message-rates", ...admin, c.upsertRate);
  app.post("/api/admin/message-rates/bulk", ...admin, c.bulkUpsertRates);
  app.delete("/api/admin/message-rates/:id", ...admin, c.deleteRate);
  app.get("/api/admin/billing-settings", ...admin, c.getBillingSettings);
  app.put("/api/admin/billing-settings", ...admin, c.updateBillingSettings);
  app.get("/api/admin/wallet/:userId", ...admin, c.getUserWallet);
  app.post("/api/admin/wallet/adjust", ...admin, c.adjustWallet);
}
