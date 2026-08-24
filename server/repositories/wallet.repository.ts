/**
 * Prepaid wallet data access: balance, atomic deduct/credit, ledger,
 * admin message-rate matrix, and billing settings.
 */
import { db } from "../db";
import { desc, eq, sql } from "drizzle-orm";
import {
  users,
  messageRates,
  billingSettings,
  walletTransactions,
  type MessageRate,
  type BillingSettings,
  type WalletTransaction,
} from "@shared/schema";

type LedgerMeta = {
  messageId?: string;
  country?: string;
  category?: string;
  description?: string;
};

export class WalletRepository {
  /**
   * The wallet is held by the account owner (admin). A team member's charges
   * hit the admin who created them. Returns the userId unchanged for admins.
   */
  async resolveOwnerUserId(userId: string): Promise<string> {
    const [u] = await db
      .select({ id: users.id, role: users.role, createdBy: users.createdBy })
      .from(users)
      .where(eq(users.id, userId));
    if (!u) return userId;
    if (u.role === "team" && u.createdBy) return u.createdBy;
    return u.id;
  }

  async getBalance(userId: string): Promise<number> {
    const [row] = await db
      .select({ b: users.walletBalance })
      .from(users)
      .where(eq(users.id, userId));
    return Number(row?.b ?? 0);
  }

  /**
   * Atomic debit. Only deducts when balance >= cost. Returns ok=false when
   * the balance is insufficient (no rows updated), so callers never oversell.
   */
  async deduct(
    userId: string,
    cost: number,
    meta: LedgerMeta
  ): Promise<{ ok: boolean; balanceAfter: number }> {
    return db.transaction(async (tx) => {
      const updated: any = await tx.execute(sql`
        UPDATE users SET wallet_balance = wallet_balance - ${cost}::numeric
        WHERE id = ${userId} AND wallet_balance >= ${cost}::numeric
        RETURNING wallet_balance AS balance_after
      `);
      const rows = updated.rows ?? updated;
      if (!rows || rows.length === 0) {
        const [cur] = await tx
          .select({ b: users.walletBalance })
          .from(users)
          .where(eq(users.id, userId));
        return { ok: false, balanceAfter: Number(cur?.b ?? 0) };
      }
      const balanceAfter = Number(rows[0].balance_after);
      await tx.insert(walletTransactions).values({
        userId,
        type: "debit",
        amount: String(-cost),
        balanceAfter: String(balanceAfter),
        messageId: meta.messageId,
        country: meta.country,
        category: meta.category,
        description: meta.description ?? "Message charge",
      });
      return { ok: true, balanceAfter };
    });
  }

  async credit(
    userId: string,
    amount: number,
    meta: LedgerMeta & { type?: "topup" | "adjustment" }
  ): Promise<{ balanceAfter: number }> {
    return db.transaction(async (tx) => {
      const updated: any = await tx.execute(sql`
        UPDATE users SET wallet_balance = wallet_balance + ${amount}::numeric
        WHERE id = ${userId}
        RETURNING wallet_balance AS balance_after
      `);
      const rows = updated.rows ?? updated;
      const balanceAfter = Number(rows[0].balance_after);
      await tx.insert(walletTransactions).values({
        userId,
        type: meta.type ?? "topup",
        amount: String(amount),
        balanceAfter: String(balanceAfter),
        messageId: meta.messageId,
        description: meta.description ?? "Wallet top-up",
      });
      return { balanceAfter };
    });
  }

  /** True if a ledger row already references this source id (idempotency). */
  async ledgerRefExists(refId: string): Promise<boolean> {
    const [row] = await db
      .select({ id: walletTransactions.id })
      .from(walletTransactions)
      .where(eq(walletTransactions.messageId, refId))
      .limit(1);
    return !!row;
  }

  async listTransactions(userId: string, limit = 50): Promise<WalletTransaction[]> {
    return db
      .select()
      .from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt))
      .limit(limit);
  }

  async getRates(): Promise<MessageRate[]> {
    return db.select().from(messageRates).orderBy(messageRates.countryCode);
  }

  async upsertRate(
    countryCode: string,
    category: string,
    rate: string
  ): Promise<MessageRate> {
    const [row] = await db
      .insert(messageRates)
      .values({ countryCode, category, rate })
      .onConflictDoUpdate({
        target: [messageRates.countryCode, messageRates.category],
        set: { rate, updatedAt: new Date() },
      })
      .returning();
    return row;
  }

  async deleteRate(id: string): Promise<void> {
    await db.delete(messageRates).where(eq(messageRates.id, id));
  }

  async getSettings(): Promise<BillingSettings> {
    const [row] = await db.select().from(billingSettings).limit(1);
    if (row) return row;
    const [created] = await db
      .insert(billingSettings)
      .values({ currency: "USD", defaultRate: "0" })
      .returning();
    return created;
  }

  async updateSettings(fields: {
    defaultRate?: string;
    markup?: string;
    walletBillingEnabled?: boolean;
  }): Promise<BillingSettings> {
    const cur = await this.getSettings();
    const set: Record<string, any> = { updatedAt: new Date() };
    if (fields.defaultRate !== undefined) set.defaultRate = fields.defaultRate;
    if (fields.markup !== undefined) set.markup = fields.markup;
    if (fields.walletBillingEnabled !== undefined)
      set.walletBillingEnabled = fields.walletBillingEnabled;
    const [row] = await db
      .update(billingSettings)
      .set(set)
      .where(eq(billingSettings.id, cur.id))
      .returning();
    return row;
  }
}

export const walletRepository = new WalletRepository();
