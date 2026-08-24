# Prepaid Wallet Billing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the subscription "plans" model with a prepaid USD wallet where each outbound template/campaign message is charged a per-(country × category) rate set by the admin; block sending when balance is insufficient.

**Architecture:** New `message_rates` / `billing_settings` / `wallet_transactions` tables + `users.walletBalance`. A `billing.service` computes cost (country from recipient phone via `libphonenumber-js` × template category) and does atomic balance deduction. Every template send routes through a `billedSendTemplate()` wrapper that checks balance before and charges after a successful send. Top-ups reuse the existing gateway checkout flow (one-off charge instead of subscription); the success webhook credits the wallet. Frontend gets a sidebar balance card, a `/wallet` page (replacing `/plans`), and an admin "Message Rates" settings tab.

**Tech Stack:** Node/Express, Drizzle ORM (node-postgres), React + wouter + @tanstack/react-query + shadcn/ui, `libphonenumber-js` (new dep).

## Global Constraints

- Wallet currency is fixed **USD** everywhere. Money columns: `numeric(precision, scale)`, stored as strings by Drizzle; parse with `Number(...)` / format with 2–4 decimals.
- Categories are exactly: `marketing` | `utility` | `authentication`. Session/free-form (`sendMessage`) sends are **never** charged.
- Rate lookup fallback order: exact `(countryCode, category)` → `billing_settings.defaultRate`. Unparseable phone → default rate (never block on parse).
- Deduction MUST be atomic and race-safe: guarded `UPDATE ... WHERE wallet_balance >= cost RETURNING`; zero rows affected = insufficient funds.
- Charge only **after** a successful WhatsApp API send. A failed send never charges.
- Admin endpoints: `requireAuth, requireRole("superadmin")`. User endpoints: `requireAuth`.
- `db` import: `import { db } from "../db"` (writes/current reads use `db`, never `dbRead`).
- No git repo in this project — "Commit" steps mean "checkpoint: verify build/tests green" (run `npm run check` / `npx vitest run <file>`), not `git commit`.

---

### Task 1: Schema — wallet column + 3 new tables

**Files:**
- Modify: `shared/schema.ts` (users table ~47-83; billing block ~605-762; insert schemas ~1383; type exports ~1475)

**Interfaces:**
- Produces: `users.walletBalance`; tables `messageRates`, `billingSettings`, `walletTransactions`; types `MessageRate`, `InsertMessageRate`, `BillingSettings`, `WalletTransaction`, `InsertWalletTransaction`.

- [ ] **Step 1: Add `walletBalance` to `users`** — inside the `users` `pgTable`, next to the gateway columns (`stripeCustomerId` etc.):

```ts
walletBalance: numeric("wallet_balance", { precision: 12, scale: 4 }).default("0"),
```

- [ ] **Step 2: Add the three tables** after the `transactions` table (`schema.ts:762`):

```ts
// Prepaid wallet — per-(country × category) message rates set by admin
export const messageRates = pgTable(
  "message_rates",
  {
    id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
    countryCode: varchar("country_code", { length: 2 }).notNull(), // ISO-3166 alpha-2, e.g. "AE"
    category: varchar("category").notNull(), // marketing | utility | authentication
    rate: numeric("rate", { precision: 10, scale: 4 }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
  },
  (table) => ({
    countryCategoryUnique: unique("message_rates_country_category_unique").on(
      table.countryCode,
      table.category
    ),
  })
);

// Singleton billing config
export const billingSettings = pgTable("billing_settings", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  currency: varchar("currency").notNull().default("USD"),
  defaultRate: numeric("default_rate", { precision: 10, scale: 4 }).notNull().default("0"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow(),
});

// Wallet ledger — every credit (topup/adjustment) and debit (message)
export const walletTransactions = pgTable("wallet_transactions", {
  id: varchar("id").primaryKey().default(sql`gen_random_uuid()`),
  userId: varchar("user_id").notNull().references(() => users.id),
  type: varchar("type").notNull(), // topup | debit | adjustment
  amount: numeric("amount", { precision: 12, scale: 4 }).notNull(), // + credit, - debit
  balanceAfter: numeric("balance_after", { precision: 12, scale: 4 }).notNull(),
  messageId: varchar("message_id"), // set for debits (links to message_queue row)
  country: varchar("country", { length: 2 }),
  category: varchar("category"),
  description: text("description"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow(),
}, (table) => ({
  userIdx: index("wallet_tx_user_idx").on(table.userId),
}));
```

- [ ] **Step 3: Insert schemas + types** near `schema.ts:1383`/`:1475`:

```ts
export const insertMessageRateSchema = createInsertSchema(messageRates).omit({ id: true, createdAt: true, updatedAt: true });
export const insertWalletTransactionSchema = createInsertSchema(walletTransactions).omit({ id: true, createdAt: true });
export type MessageRate = typeof messageRates.$inferSelect;
export type InsertMessageRate = z.infer<typeof insertMessageRateSchema>;
export type BillingSettings = typeof billingSettings.$inferSelect;
export type WalletTransaction = typeof walletTransactions.$inferSelect;
export type InsertWalletTransaction = z.infer<typeof insertWalletTransactionSchema>;
```

- [ ] **Step 4: Typecheck** — `npm run check` (tsc). Expected: no new type errors from schema.ts. (`unique` and `index` are already imported in schema.ts — verify at top; add to the drizzle-orm/pg-core import if missing.)

- [ ] **Step 5: Checkpoint** — schema compiles.

---

### Task 2: Wallet repository

**Files:**
- Create: `server/repositories/wallet.repository.ts`

**Interfaces:**
- Consumes: `db` from `../db`; tables/types from Task 1.
- Produces: `class WalletRepository` with methods:
  - `getBalance(userId): Promise<number>`
  - `deduct(userId, cost, ledger): Promise<{ ok: boolean; balanceAfter: number }>` — atomic guarded update
  - `credit(userId, amount, ledger): Promise<{ balanceAfter: number }>`
  - `listTransactions(userId, limit): Promise<WalletTransaction[]>`
  - `getRates(): Promise<MessageRate[]>`, `upsertRate(...)`, `deleteRate(id)`
  - `getSettings(): Promise<BillingSettings>`, `updateSettings(...)`

- [ ] **Step 1: Write the repository** (real code):

```ts
import { db } from "../db";
import { and, desc, eq, sql } from "drizzle-orm";
import {
  users, messageRates, billingSettings, walletTransactions,
  type MessageRate, type BillingSettings, type WalletTransaction,
} from "@shared/schema";

type LedgerMeta = { messageId?: string; country?: string; category?: string; description?: string };

export class WalletRepository {
  async getBalance(userId: string): Promise<number> {
    const [row] = await db.select({ b: users.walletBalance }).from(users).where(eq(users.id, userId));
    return Number(row?.b ?? 0);
  }

  // Atomic: only deducts if balance >= cost. Returns ok=false when insufficient.
  async deduct(userId: string, cost: number, meta: LedgerMeta): Promise<{ ok: boolean; balanceAfter: number }> {
    return db.transaction(async (tx) => {
      const updated = await tx.execute(sql`
        UPDATE users SET wallet_balance = wallet_balance - ${cost}
        WHERE id = ${userId} AND wallet_balance >= ${cost}
        RETURNING wallet_balance AS balance_after
      `);
      const rows = (updated as any).rows ?? updated;
      if (!rows || rows.length === 0) {
        const [cur] = await tx.select({ b: users.walletBalance }).from(users).where(eq(users.id, userId));
        return { ok: false, balanceAfter: Number(cur?.b ?? 0) };
      }
      const balanceAfter = Number(rows[0].balance_after);
      await tx.insert(walletTransactions).values({
        userId, type: "debit", amount: String(-cost), balanceAfter: String(balanceAfter),
        messageId: meta.messageId, country: meta.country, category: meta.category,
        description: meta.description ?? "Message charge",
      });
      return { ok: true, balanceAfter };
    });
  }

  async credit(userId: string, amount: number, meta: LedgerMeta & { type?: "topup" | "adjustment" }): Promise<{ balanceAfter: number }> {
    return db.transaction(async (tx) => {
      const updated = await tx.execute(sql`
        UPDATE users SET wallet_balance = wallet_balance + ${amount}
        WHERE id = ${userId}
        RETURNING wallet_balance AS balance_after
      `);
      const rows = (updated as any).rows ?? updated;
      const balanceAfter = Number(rows[0].balance_after);
      await tx.insert(walletTransactions).values({
        userId, type: meta.type ?? "topup", amount: String(amount), balanceAfter: String(balanceAfter),
        description: meta.description ?? "Wallet top-up",
      });
      return { balanceAfter };
    });
  }

  async listTransactions(userId: string, limit = 50): Promise<WalletTransaction[]> {
    return db.select().from(walletTransactions)
      .where(eq(walletTransactions.userId, userId))
      .orderBy(desc(walletTransactions.createdAt)).limit(limit);
  }

  async getRates(): Promise<MessageRate[]> {
    return db.select().from(messageRates).orderBy(messageRates.countryCode);
  }

  async upsertRate(countryCode: string, category: string, rate: string): Promise<MessageRate> {
    const [row] = await db.insert(messageRates)
      .values({ countryCode, category, rate })
      .onConflictDoUpdate({
        target: [messageRates.countryCode, messageRates.category],
        set: { rate, updatedAt: new Date() },
      }).returning();
    return row;
  }

  async deleteRate(id: string): Promise<void> {
    await db.delete(messageRates).where(eq(messageRates.id, id));
  }

  async getSettings(): Promise<BillingSettings> {
    const [row] = await db.select().from(billingSettings).limit(1);
    if (row) return row;
    const [created] = await db.insert(billingSettings).values({ currency: "USD", defaultRate: "0" }).returning();
    return created;
  }

  async updateSettings(defaultRate: string): Promise<BillingSettings> {
    const cur = await this.getSettings();
    const [row] = await db.update(billingSettings)
      .set({ defaultRate, updatedAt: new Date() })
      .where(eq(billingSettings.id, cur.id)).returning();
    return row;
  }
}

export const walletRepository = new WalletRepository();
```

- [ ] **Step 2: Typecheck** — `npm run check`. Expected: passes.

---

### Task 3: Billing service — cost calculation (TDD)

**Files:**
- Create: `server/services/billing.service.ts`
- Test: `server/__tests__/billing-cost.test.ts`
- Add dep: `libphonenumber-js`

**Interfaces:**
- Consumes: `walletRepository` (Task 2).
- Produces:
  - `phoneToCountry(phone: string): string | null` — ISO-2 or null
  - `getMessageCost(phone: string, category: string): Promise<{ country: string | null; rate: number }>`

- [ ] **Step 1: Add dependency** — `npm install libphonenumber-js`. Expected: added to package.json dependencies.

- [ ] **Step 2: Write the failing test** `server/__tests__/billing-cost.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../services/billing.repo", () => ({}));
const rates = [{ countryCode: "AE", category: "marketing", rate: "0.20" }];
vi.mock("../repositories/wallet.repository", () => ({
  walletRepository: {
    getRates: vi.fn(async () => rates),
    getSettings: vi.fn(async () => ({ defaultRate: "0.10", currency: "USD" })),
  },
}));

import { phoneToCountry, getMessageCost } from "../services/billing.service";

describe("phoneToCountry", () => {
  it("maps a UAE number to AE", () => expect(phoneToCountry("+971501234567")).toBe("AE"));
  it("maps an Indian number to IN", () => expect(phoneToCountry("919812345678")).toBe("IN"));
  it("returns null for garbage", () => expect(phoneToCountry("12")).toBe(null));
});

describe("getMessageCost", () => {
  it("uses the exact country+category rate", async () => {
    expect(await getMessageCost("+971501234567", "marketing")).toEqual({ country: "AE", rate: 0.2 });
  });
  it("falls back to default rate when no match", async () => {
    expect(await getMessageCost("+919812345678", "marketing")).toEqual({ country: "IN", rate: 0.1 });
  });
  it("uses default rate for unparseable phone", async () => {
    expect(await getMessageCost("12", "marketing")).toEqual({ country: null, rate: 0.1 });
  });
});
```

- [ ] **Step 3: Run test, verify it fails** — `npx vitest run server/__tests__/billing-cost.test.ts`. Expected: FAIL (module not found / functions undefined).

- [ ] **Step 4: Implement** `server/services/billing.service.ts`:

```ts
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { walletRepository } from "../repositories/wallet.repository";

export function phoneToCountry(phone: string): string | null {
  if (!phone) return null;
  const withPlus = phone.trim().startsWith("+") ? phone.trim() : `+${phone.replace(/\D/g, "")}`;
  const parsed = parsePhoneNumberFromString(withPlus);
  return parsed?.country ?? null;
}

export async function getMessageCost(
  phone: string,
  category: string
): Promise<{ country: string | null; rate: number }> {
  const country = phoneToCountry(phone);
  const settings = await walletRepository.getSettings();
  const defaultRate = Number(settings.defaultRate ?? 0);
  if (!country) return { country: null, rate: defaultRate };
  const rates = await walletRepository.getRates();
  const match = rates.find((r) => r.countryCode === country && r.category === category);
  return { country, rate: match ? Number(match.rate) : defaultRate };
}
```

- [ ] **Step 5: Run test, verify it passes** — `npx vitest run server/__tests__/billing-cost.test.ts`. Expected: PASS (6 tests).

---

### Task 4: Billing service — charge + credit (TDD-light)

**Files:**
- Modify: `server/services/billing.service.ts`

**Interfaces:**
- Consumes: `getMessageCost` (Task 3), `walletRepository` (Task 2).
- Produces:
  - `hasSufficientBalance(userId, phone, category): Promise<{ ok: boolean; cost: number; country: string|null }>`
  - `chargeForMessage(userId, phone, category, messageId?): Promise<{ charged: boolean; cost: number; balanceAfter: number }>`

- [ ] **Step 1: Add functions** to `billing.service.ts`:

```ts
export async function hasSufficientBalance(userId: string, phone: string, category: string) {
  const { cost, country } = await getCost(userId, phone, category);
  const balance = await walletRepository.getBalance(userId);
  return { ok: balance >= cost, cost, country };
}

async function getCost(userId: string, phone: string, category: string) {
  const { country, rate } = await getMessageCost(phone, category);
  return { cost: rate, country };
}

export async function chargeForMessage(userId: string, phone: string, category: string, messageId?: string) {
  const { country, rate } = await getMessageCost(phone, category);
  if (rate <= 0) return { charged: true, cost: 0, balanceAfter: await walletRepository.getBalance(userId) };
  const res = await walletRepository.deduct(userId, rate, {
    messageId, country: country ?? undefined, category,
    description: `Message to ${country ?? "unknown"} (${category})`,
  });
  return { charged: res.ok, cost: rate, balanceAfter: res.balanceAfter };
}
```

- [ ] **Step 2: Typecheck + existing tests** — `npm run check` then `npx vitest run server/__tests__/billing-cost.test.ts`. Expected: green.

---

### Task 5: Billed send wrapper + wire into send sites

**Files:**
- Create: `server/services/billed-send.ts`
- Modify: every caller of `WhatsAppApiService.sendTemplateMessage(...)` — discover with grep (Step 2). Known: `server/services/message-queue.ts`, `server/services/messageService.ts`, `server/controllers/campaigns.controller.ts`, `server/controllers/messages.controller.ts`, `server/routes/rest-api-v1.routes.ts`, `server/routes/whatsapp.routes.ts`.

**Interfaces:**
- Consumes: `hasSufficientBalance`, `chargeForMessage` (Task 4); `WhatsAppApiService.sendTemplateMessage` (existing, static).
- Produces: `billedSendTemplate({ userId, channel, to, templateName, components, language, isMarketing, category, messageId }): Promise<any>` — throws `InsufficientBalanceError` (a named error class) before send when balance too low; charges after success.

- [ ] **Step 1: Write the wrapper** `server/services/billed-send.ts`:

```ts
import { WhatsAppApiService } from "./whatsapp-api";
import { hasSufficientBalance, chargeForMessage } from "./billing.service";
import type { Channel } from "@shared/schema";

export class InsufficientBalanceError extends Error {
  code = "INSUFFICIENT_BALANCE" as const;
  constructor(public cost: number) { super("Insufficient wallet balance"); }
}

export async function billedSendTemplate(args: {
  userId: string;
  channel: Channel;
  to: string;
  templateName: string;
  components?: any[];
  language?: string;
  isMarketing?: boolean;
  category: string; // marketing | utility | authentication (from template.category)
  messageId?: string;
}): Promise<any> {
  const { userId, channel, to, templateName, components = [], language = "en_US", isMarketing = true, category, messageId } = args;
  const check = await hasSufficientBalance(userId, to, category);
  if (!check.ok) throw new InsufficientBalanceError(check.cost);
  const result = await WhatsAppApiService.sendTemplateMessage(channel, to, templateName, components, language, isMarketing);
  await chargeForMessage(userId, to, category, messageId); // only after a successful send
  return result;
}
```

- [ ] **Step 2: Discover all send sites** — Run: `grep -rn "sendTemplateMessage" server/ --include=*.ts | grep -v "__tests__" | grep -v "whatsapp-api.ts"`. For EACH result that is an outbound template send with a known sending user + template, replace the direct `WhatsAppApiService.sendTemplateMessage(channel, to, ...)` call with `billedSendTemplate({ userId, channel, to, templateName, components, language, isMarketing, category, messageId })`, sourcing:
  - `userId`: the campaign/message owner (`campaign.userId` / `req.user.id` / queue row `userId`).
  - `category`: from the template row (`templates.category`; normalize `transactional`→`utility`).
  - `messageId`: the `message_queue` row id when available.

- [ ] **Step 3: Handle the block in the queue worker** — In `server/services/message-queue.ts`, wrap the send in try/catch; on `InsufficientBalanceError` mark the queue row `status: "failed"`, `errorMessage: "insufficient_balance"` (do NOT retry/requeue), and emit the existing failure path. Show the pattern at the worker's send call:

```ts
try {
  await billedSendTemplate({ userId, channel, to: row.recipientPhone, templateName, components, language, isMarketing, category, messageId: row.id });
} catch (err: any) {
  if (err?.code === "INSUFFICIENT_BALANCE") {
    await markMessageFailed(row.id, "insufficient_balance"); // use the existing failed-marking helper in this file
    continue; // skip requeue
  }
  throw err;
}
```

- [ ] **Step 4: Handle the block in single-send controllers** — In `messages.controller.ts` / `rest-api-v1.routes.ts` catch `INSUFFICIENT_BALANCE` and return HTTP 402:

```ts
if (err?.code === "INSUFFICIENT_BALANCE") {
  return res.status(402).json({ error: "Insufficient balance. Please top up your wallet." });
}
```

- [ ] **Step 5: Typecheck** — `npm run check`. Expected: passes.

---

### Task 6: Wallet top-up — one-off gateway charge + routes

**Files:**
- Modify: `server/services/payment-gateway.service.ts` (add one-off charge functions modeled on `createStripeSubscription:487-555`)
- Create: `server/controllers/wallet.controller.ts`
- Create: `server/routes/wallet.routes.ts`
- Modify: `server/routes/index.ts` (register)

**Interfaces:**
- Consumes: existing gateway singletons/config; `walletRepository`.
- Produces routes:
  - `GET /api/wallet/balance` (requireAuth) → `{ balance, currency }`
  - `GET /api/wallet/transactions` (requireAuth) → `WalletTransaction[]`
  - `POST /api/wallet/topup/initiate` (requireAuth) `{ amount, paymentProviderId }` → `{ transactionId, checkoutUrl }`

- [ ] **Step 1: Add one-off charge functions** in `payment-gateway.service.ts` (Stripe template):

```ts
export async function createStripeTopupCheckout(userId: string, amount: number, transactionId: string) {
  const stripe = await getStripe();
  const appUrl = getAppUrl();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    client_reference_id: transactionId,
    line_items: [{
      price_data: { currency: "usd", unit_amount: Math.round(amount * 100), product_data: { name: "Wallet top-up" } },
      quantity: 1,
    }],
    success_url: `${appUrl}/payment/success?provider=stripe&transactionId=${transactionId}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${appUrl}/wallet?status=cancelled`,
    metadata: { platformUserId: userId, transactionId, kind: "wallet_topup" },
  });
  return { checkoutUrl: session.url };
}
```
Add equivalent `createRazorpayTopup` / `createPaystackTopup` etc. following the existing `create*Subscription` shapes (use one-off order/charge endpoints, set metadata/notes `kind: "wallet_topup"`, `platformUserId`, `transactionId`).

- [ ] **Step 2: Write the wallet controller** `server/controllers/wallet.controller.ts`:

```ts
import type { Request, Response } from "express";
import { db } from "../db";
import { transactions, paymentProviders } from "@shared/schema";
import { eq } from "drizzle-orm";
import { walletRepository } from "../repositories/wallet.repository";
import { createStripeTopupCheckout /*, others */ } from "../services/payment-gateway.service";

export async function getWalletBalance(req: Request, res: Response) {
  const userId = (req as any).user.id;
  const balance = await walletRepository.getBalance(userId);
  res.json({ balance, currency: "USD" });
}

export async function getWalletTransactions(req: Request, res: Response) {
  const userId = (req as any).user.id;
  res.json(await walletRepository.listTransactions(userId, 100));
}

export async function initiateTopup(req: Request, res: Response) {
  const userId = (req as any).user.id;
  const { amount, paymentProviderId } = req.body as { amount: number; paymentProviderId: string };
  if (!amount || amount <= 0) return res.status(400).json({ error: "Invalid amount" });
  const [provider] = await db.select().from(paymentProviders).where(eq(paymentProviders.id, paymentProviderId));
  if (!provider) return res.status(404).json({ error: "Provider not found" });

  const [tx] = await db.insert(transactions).values({
    userId, paymentProviderId, amount: String(amount), currency: "USD",
    billingCycle: "topup", status: "pending",
    metadata: { kind: "wallet_topup" } as any,
  }).returning();

  let checkoutUrl: string | undefined;
  if (provider.providerKey === "stripe") ({ checkoutUrl } = await createStripeTopupCheckout(userId, amount, tx.id));
  // else if (provider.providerKey === "razorpay") { ... }
  else return res.status(400).json({ error: "Gateway not supported for top-up yet" });

  await db.update(transactions).set({ providerTransactionId: tx.id }).where(eq(transactions.id, tx.id));
  res.json({ transactionId: tx.id, checkoutUrl });
}
```
NOTE: `transactions.planId` is currently NOT NULL (`schema.ts:720-722`). In Task 1 or here, make `planId` nullable (remove `.notNull()`) so top-up rows need no plan. Add this schema tweak to Task 1's Step 2 if not already done.

- [ ] **Step 3: Routes** `server/routes/wallet.routes.ts`:

```ts
import type { Express } from "express";
import { requireAuth } from "../middlewares/auth.middleware";
import { getWalletBalance, getWalletTransactions, initiateTopup } from "../controllers/wallet.controller";

export function registerWalletRoutes(app: Express) {
  app.get("/api/wallet/balance", requireAuth, getWalletBalance);
  app.get("/api/wallet/transactions", requireAuth, getWalletTransactions);
  app.post("/api/wallet/topup/initiate", requireAuth, initiateTopup);
}
```
Register in `server/routes/index.ts` near line 92: `registerWalletRoutes(app);` (add the import).

- [ ] **Step 4: Typecheck** — `npm run check`. Expected: passes.

---

### Task 7: Credit wallet on successful payment (repurpose webhook activation)

**Files:**
- Modify: `server/controllers/webhooks.controller.ts` — `activateSubscriptionFromTransaction` (`:3017-3106`) and any topup-aware branch.

**Interfaces:**
- Consumes: `walletRepository.credit`.
- Produces: wallet-credit behavior on `kind: "wallet_topup"` transactions; subscription path removed.

- [ ] **Step 1: Branch on topup** — At the top of `activateSubscriptionFromTransaction` (after the `transaction` is loaded and the existing idempotency/dedup guards at `:3027-3035`), add:

```ts
const isTopup = (transaction.metadata as any)?.kind === "wallet_topup" || transaction.billingCycle === "topup";
if (isTopup) {
  // idempotency: only credit if not already completed-credited
  if (transaction.status === "completed" && (transaction.metadata as any)?.credited) return;
  await walletRepository.credit(transaction.userId, Number(transaction.amount), {
    type: "topup", description: `Top-up via ${transaction.paymentProviderId}`,
  });
  await db.update(transactions)
    .set({ status: "completed", paidAt: new Date(), metadata: { ...(transaction.metadata as any), credited: true } })
    .where(eq(transactions.id, transaction.id));
  return;
}
```
Keep the Redis dedup key guard above this so webhook + cron double-fire cannot double-credit. Import `walletRepository` at top of the file.

- [ ] **Step 2: Typecheck** — `npm run check`. Expected: passes.

- [ ] **Step 3: Manual verification note** (post-deploy): perform a small Stripe test top-up → confirm one `wallet_transactions` topup row + balance increment; re-deliver the webhook from the Stripe dashboard → confirm balance does NOT change again.

---

### Task 8: Admin — Message Rates + settings API

**Files:**
- Create: `server/controllers/message-rates.controller.ts`
- Create: `server/routes/message-rates.routes.ts`
- Modify: `server/routes/index.ts` (register near `:70`)

**Interfaces:**
- Produces routes (all `requireAuth, requireRole("superadmin")`):
  - `GET /api/admin/message-rates` → `MessageRate[]`
  - `POST /api/admin/message-rates` `{ countryCode, category, rate }` → upsert
  - `DELETE /api/admin/message-rates/:id`
  - `GET /api/admin/billing-settings` → `{ currency, defaultRate }`
  - `PUT /api/admin/billing-settings` `{ defaultRate }`
  - `POST /api/admin/wallet/adjust` `{ userId, amount, description }` → manual credit/debit

- [ ] **Step 1: Controller** `server/controllers/message-rates.controller.ts`:

```ts
import type { Request, Response } from "express";
import { walletRepository } from "../repositories/wallet.repository";

const CATEGORIES = ["marketing", "utility", "authentication"];

export async function listRates(_req: Request, res: Response) {
  res.json(await walletRepository.getRates());
}
export async function upsertRate(req: Request, res: Response) {
  const { countryCode, category, rate } = req.body;
  if (!countryCode || !CATEGORIES.includes(category) || rate == null || Number(rate) < 0)
    return res.status(400).json({ error: "Invalid rate payload" });
  res.json(await walletRepository.upsertRate(String(countryCode).toUpperCase(), category, String(rate)));
}
export async function deleteRate(req: Request, res: Response) {
  await walletRepository.deleteRate(req.params.id);
  res.json({ ok: true });
}
export async function getBillingSettings(_req: Request, res: Response) {
  res.json(await walletRepository.getSettings());
}
export async function updateBillingSettings(req: Request, res: Response) {
  const { defaultRate } = req.body;
  if (defaultRate == null || Number(defaultRate) < 0) return res.status(400).json({ error: "Invalid defaultRate" });
  res.json(await walletRepository.updateSettings(String(defaultRate)));
}
export async function adjustWallet(req: Request, res: Response) {
  const { userId, amount, description } = req.body;
  if (!userId || amount == null) return res.status(400).json({ error: "userId and amount required" });
  const r = await walletRepository.credit(userId, Number(amount), { type: "adjustment", description: description || "Admin adjustment" });
  res.json({ balanceAfter: r.balanceAfter });
}
```

- [ ] **Step 2: Routes** `server/routes/message-rates.routes.ts`:

```ts
import type { Express } from "express";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import * as c from "../controllers/message-rates.controller";

export function registerMessageRatesRoutes(app: Express) {
  const admin = [requireAuth, requireRole("superadmin")];
  app.get("/api/admin/message-rates", ...admin, c.listRates);
  app.post("/api/admin/message-rates", ...admin, c.upsertRate);
  app.delete("/api/admin/message-rates/:id", ...admin, c.deleteRate);
  app.get("/api/admin/billing-settings", ...admin, c.getBillingSettings);
  app.put("/api/admin/billing-settings", ...admin, c.updateBillingSettings);
  app.post("/api/admin/wallet/adjust", ...admin, c.adjustWallet);
}
```
Register in `server/routes/index.ts` near `:70`.

- [ ] **Step 3: Typecheck** — `npm run check`. Expected: passes.

---

### Task 9: Frontend — wallet balance query + sidebar card

**Files:**
- Modify: `client/src/contexts/auth-context.tsx` (add `useWallet`-style query, expose `walletBalance`)
- Modify: `client/src/components/layout/sidebar.tsx` (insert card after AI card ~line 797, before profile block ~806)

**Interfaces:**
- Produces: `useAuth().walletBalance: number | null`; a wallet card in the sidebar linking to `/wallet`.

- [ ] **Step 1: Add the balance query** in `auth-context.tsx`, mirroring the `userPlans` query (`:92-102`):

```tsx
const { data: walletData } = useQuery<{ balance: number; currency: string }>({
  queryKey: ["/api/wallet/balance"],
  queryFn: async () => {
    const res = await apiRequest("GET", "/api/wallet/balance");
    if (!res.ok) throw new Error("Failed to fetch wallet");
    return res.json();
  },
  enabled: !!user?.id,
});
```
Add `walletBalance: walletData?.balance ?? null` to the context value and to the `AuthContextType` interface (`:48-58`).

- [ ] **Step 2: Sidebar card** — in `sidebar.tsx`, insert between the AI Assistant card and the profile block:

```tsx
<div className="p-2 border-t border-gray-100">
  <Link href="/wallet">
    <div className="flex items-center space-x-3 p-3 bg-green-50 border border-green-100 rounded-lg cursor-pointer hover:bg-green-100 transition">
      <div className="w-8 h-8 bg-green-600 rounded-lg flex items-center justify-center">
        <Wallet className="w-4 h-4 text-white" />
      </div>
      <div className="flex-1">
        <p className="text-xs text-gray-500">{t("wallet.balance")}</p>
        <p className="text-sm font-semibold text-gray-900">${(walletBalance ?? 0).toFixed(2)}</p>
      </div>
      <span className="text-xs font-medium text-green-700">{t("wallet.topup")}</span>
    </div>
  </Link>
</div>
```
Import `Wallet` from `lucide-react`; pull `walletBalance` from `useAuth()`.

- [ ] **Step 3: Build check** — `npm run build` (or `npm run check`). Expected: compiles.

---

### Task 10: Frontend — `/wallet` page + route swap

**Files:**
- Create: `client/src/pages/wallet.tsx`
- Modify: `client/src/App.tsx` (add `/wallet` route + `ROUTE_PERMISSIONS` entry; keep `/plans` importing until Task 12 removes it)

**Interfaces:**
- Consumes: `/api/wallet/balance`, `/api/wallet/transactions`, `/api/payment-providers`, `/api/wallet/topup/initiate`.

- [ ] **Step 1: Page** `client/src/pages/wallet.tsx` — balance card, amount input + provider select + "Top up" button (calls `POST /api/wallet/topup/initiate` then redirects to `checkoutUrl`), and a transactions table. Use shadcn `Card/Button/Input/Select/Table` and the `apiRequest` pattern. Representative top-up handler:

```tsx
const handleTopup = async () => {
  const res = await apiRequest("POST", "/api/wallet/topup/initiate", { amount: Number(amount), paymentProviderId });
  const data = await res.json();
  if (data.checkoutUrl) window.location.href = data.checkoutUrl;
};
```

- [ ] **Step 2: Route** — in `App.tsx`: import `Wallet` page, add inside the Switch:

```tsx
<Route path="/wallet"><PermissionRoute component={WalletPage} /></Route>
```
and add `"/wallet": ""` to `ROUTE_PERMISSIONS` (~line 117).

- [ ] **Step 3: Build check** — `npm run build`. Expected: compiles; `/wallet` reachable.

---

### Task 11: Frontend — Admin Message Rates settings tab

**Files:**
- Create: `client/src/components/settings/MessageRatesSettings.tsx`
- Modify: `client/src/pages/settings.tsx` (add superadmin `TabsTrigger` + `TabsContent`)

**Interfaces:**
- Consumes: `/api/admin/message-rates`, `/api/admin/billing-settings`.

- [ ] **Step 1: Component** — `MessageRatesSettings.tsx`: default-rate input (GET/PUT `/api/admin/billing-settings`), a table of rates (GET `/api/admin/message-rates`) with add row (country select + category select + rate input → POST) and delete (DELETE `/api/admin/message-rates/:id`). Model the structure on `GeneralSettings.tsx`; use `useQuery`/`useMutation` + `queryClient.invalidateQueries`.

- [ ] **Step 2: Tab wiring** — in `settings.tsx` superadmin block (triggers ~135-177, content ~225-256):

```tsx
<TabsTrigger value="message_rates" className={tabTriggerClass}>
  <CreditCard className="w-4 h-4 shrink-0" /><span>Message Rates</span>
</TabsTrigger>
```
```tsx
<TabsContent value="message_rates"><MessageRatesSettings /></TabsContent>
```

- [ ] **Step 3: Build check** — `npm run build`. Expected: compiles.

---

### Task 12: Remove the plans/subscription system

**Files:**
- Modify: `client/src/App.tsx` (remove `/plans`, `/plan-upgrade` routes + imports + `ROUTE_PERMISSIONS` 117/118), `client/src/components/layout/sidebar.tsx` (replace `/plans` nav entries at 171-177, 289-296, 361-366 with a `/wallet` entry)
- Modify server registration: `server/routes/index.ts` — remove `registerPlansRoutes`/`registerSubscriptionRoutes` (`:70`, `:94`)
- Modify: `server/middlewares/requireSubscription.ts` and `server/middlewares/apikey.middleware.ts` — replace subscription/plan-limit gating with wallet-balance checks (or a no-op pass-through where a plan limit no longer applies)
- Delete/park: `client/src/pages/plans.tsx`, `server/controllers/plans.controller.ts`, `server/controllers/subscriptions.controller.ts`, `server/routes/plans.routes.ts`, `server/routes/subscriptions.routes.ts`

**Interfaces:**
- Produces: no `/plans` route, no subscription gating; API access no longer blocked by "no active subscription".

- [ ] **Step 1: Remove frontend plan routes/links** — delete the two `Plans` route blocks and import in `App.tsx`; replace sidebar `/plans` nav items with a "Wallet" item (`href: "/wallet"`).
- [ ] **Step 2: Neutralize subscription gating** — in `requireSubscription.ts`, replace the "active subscription required" block (`:218-334`) with allow-through (the wallet balance check now governs sending, not route access). In `apikey.middleware.ts`, remove the subscription lookup gate (keep rate-limiting).
- [ ] **Step 3: Unregister plan/subscription routes** — remove their `register*Routes(app)` calls in `server/routes/index.ts`.
- [ ] **Step 4: Typecheck + build** — `npm run check && npm run build`. Fix any dangling imports to deleted modules. Expected: green.
- [ ] **Step 5: Checkpoint** — app builds with no plans UI and no subscription gate.

---

### Task 13: DB migration, seed, and deploy

**Files:**
- Modify: `server/startup-migration.ts` (idempotent add of `wallet_balance` column + new tables safety), `server/seed.ts` (seed `billing_settings`)
- Local build + server deploy

**Interfaces:** none (ops task).

- [ ] **Step 1: Make `transactions.planId` nullable** — confirm Task 1 removed `.notNull()` from `transactions.planId`; if code elsewhere inserts transactions requiring planId, guard those.
- [ ] **Step 2: Seed billing settings** — in `seed.ts` (or startup), insert one `billing_settings` row if none (`currency: "USD"`, `defaultRate` e.g. `"0.10"`). Optionally seed a starter `message_rates` set (e.g. `AE/IN/US × marketing/utility/authentication`).
- [ ] **Step 3: Local build** — `npm install && npm run build`. Expected: dist built, includes libphonenumber-js.
- [ ] **Step 4: Deploy** (per deployment memory) — rsync source to server **with `--exclude 'uploads' --exclude 'public'`**, then as `tickai` user: `cd ~/htdocs/tickai.app && source .env && npm install && npm run build && npm run db:push -- --force`. Then restart: `systemctl restart whatsway` (needs root — coordinate with user, since root key currently rejected).
- [ ] **Step 5: Post-deploy verification** —
  - `curl -s -o /dev/null -w "%{http_code}" https://tickai.app/` → 200.
  - Admin: set a UAE marketing rate 0.20 + default 0.10 in Settings → Message Rates.
  - Top up a test wallet via gateway → balance rises; ledger shows a `topup` row.
  - Send a marketing template to a `+971` number → balance drops by 0.20; ledger shows a `debit` row with country `AE`.
  - Drain balance below cost → send is blocked (queue rows `failed: insufficient_balance` / 402 on single send).

---

## Self-Review

**Spec coverage:** wallet balance (T1/T2), country×category rates (T1/T3/T8), USD single currency (global constraint), charge every template send / free session sends (T5), block on insufficient (T4/T5), default-rate fallback + unparseable→default (T3), gateway self top-up (T6/T7), remove plans (T12), sidebar card + /wallet + admin rates (T9/T10/T11), migration/deploy (T13). All spec sections mapped.

**Placeholder scan:** Task 5 (send-site wiring), Task 10/11 (UI pages) intentionally include a discovery/grep step because exact call sites and full JSX are large; each provides the representative code + exact anchors and the pattern to replicate. No "TODO/handle edge cases" left as the actual deliverable.

**Type consistency:** `walletRepository` method names (`getBalance/deduct/credit/listTransactions/getRates/upsertRate/deleteRate/getSettings/updateSettings`) are used identically across T4/T6/T7/T8. `InsufficientBalanceError.code === "INSUFFICIENT_BALANCE"` matches the checks in T5. `getMessageCost` return `{country, rate}` consumed consistently in T4.
