import type { Express } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import * as c from "../controllers/ordering.controller";

export function registerOrderingRoutes(app: Express) {
  const admin = [requireAuth, requireRole("superadmin", "admin")];
  app.get("/api/ordering/products", ...admin, c.listProducts);
  app.post("/api/ordering/products", ...admin, c.createProduct);
  app.put("/api/ordering/products/:id", ...admin, c.updateProduct);
  app.delete("/api/ordering/products/:id", ...admin, c.deleteProduct);
  app.get("/api/ordering/orders", ...admin, c.listOrders);
  app.put("/api/ordering/orders/:id/status", ...admin, c.updateOrderStatus);
}
