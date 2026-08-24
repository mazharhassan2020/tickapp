import type { Express } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import {
  getWalletBalance,
  getWalletTransactions,
  initiateTopup,
} from "../controllers/wallet.controller";

export function registerWalletRoutes(app: Express) {
  app.get("/api/wallet/balance", requireAuth, getWalletBalance);
  app.get("/api/wallet/transactions", requireAuth, getWalletTransactions);
  app.post("/api/wallet/topup/initiate", requireAuth, initiateTopup);
}
