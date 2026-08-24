/**
 * User-facing wallet endpoints: current balance, transaction history, and
 * initiating a gateway top-up. Top-up success is credited by the payment
 * webhook (see webhooks.controller activateSubscriptionFromTransaction).
 */
import type { Request, Response } from "express";
import { db } from "../db";
import { transactions, paymentProviders } from "@shared/schema";
import { eq } from "drizzle-orm";
import { walletRepository } from "../repositories/wallet.repository";
import { createStripeTopupCheckout } from "../services/payment-gateway.service";
import { getStoreCurrency } from "../services/billing.service";

function currentUserId(req: Request): string {
  return (req as any).user?.id;
}

export async function getWalletBalance(req: Request, res: Response) {
  const userId = await walletRepository.resolveOwnerUserId(currentUserId(req));
  const balance = await walletRepository.getBalance(userId);
  const currency = await getStoreCurrency();
  res.json({ balance, currency });
}

export async function getWalletTransactions(req: Request, res: Response) {
  const userId = await walletRepository.resolveOwnerUserId(currentUserId(req));
  res.json(await walletRepository.listTransactions(userId, 100));
}

export async function initiateTopup(req: Request, res: Response) {
  const userId = await walletRepository.resolveOwnerUserId(currentUserId(req));
  const { amount, paymentProviderId } = req.body as {
    amount: number;
    paymentProviderId: string;
  };

  if (!amount || Number(amount) <= 0) {
    return res.status(400).json({ error: "Invalid amount" });
  }
  if (!paymentProviderId) {
    return res.status(400).json({ error: "paymentProviderId is required" });
  }

  const [provider] = await db
    .select()
    .from(paymentProviders)
    .where(eq(paymentProviders.id, paymentProviderId));
  if (!provider) return res.status(404).json({ error: "Provider not found" });

  const currency = await getStoreCurrency();

  const [tx] = await db
    .insert(transactions)
    .values({
      userId,
      paymentProviderId,
      amount: String(amount),
      currency,
      billingCycle: "topup",
      status: "pending",
      metadata: { kind: "wallet_topup" } as any,
    })
    .returning();

  let checkoutUrl: string | undefined;
  try {
    if (provider.providerKey === "stripe") {
      ({ checkoutUrl } = await createStripeTopupCheckout(
        userId,
        Number(amount),
        tx.id,
        currency
      ));
    } else {
      return res.status(400).json({
        error: `Top-up is not yet supported for ${provider.name}. Please use Stripe.`,
      });
    }
  } catch (err: any) {
    await db
      .update(transactions)
      .set({ status: "failed" })
      .where(eq(transactions.id, tx.id));
    return res
      .status(500)
      .json({ error: err?.message || "Failed to initiate top-up" });
  }

  await db
    .update(transactions)
    .set({ providerTransactionId: tx.id })
    .where(eq(transactions.id, tx.id));

  res.json({ transactionId: tx.id, checkoutUrl });
}
