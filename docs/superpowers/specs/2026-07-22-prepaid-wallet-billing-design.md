# Design: Plans → Prepaid Wallet with Country × Category Billing

**Date:** 2026-07-22
**Project:** WhatsWay (tickai.app)
**Status:** Approved design, ready for implementation planning

## Problem / Goal

Replace the current subscription **plans** model with a **prepaid wallet (top-up)** model.
Instead of buying a monthly/annual plan, each user maintains a wallet balance and is
charged **per outbound WhatsApp message**. The per-message price is set by the admin and
depends on both the **recipient's country** and the **message category**
(marketing / utility / authentication). Example: a marketing message to a UAE number
(`+971…`) costs `0.20`.

## Decisions (locked)

| Topic | Decision |
|-------|----------|
| Top-up method | User tops up themselves via the already-integrated payment gateways (Stripe/Razorpay/PayPal/Paystack/MercadoPago) |
| Plans system | **Fully removed** (tables, `/plans` page, upgrade modal, plan-limit checks) |
| Insufficient balance | **Block send**; message marked failed with reason `insufficient_balance` |
| Wallet currency | Single fixed currency: **USD** |
| Rate granularity | **Country × Category** (marketing / utility / authentication) |
| Charged messages | Every outbound **template/campaign** message |
| Session/inbox free-form replies | **Free (0)** — WhatsApp-like service-message model |
| Unconfigured country/category | Fall back to admin-set **global default rate** |
| Unparseable / unknown-country number | Apply **global default rate** (do not block on a parse quirk) |
| Balance display | **Sidebar wallet card** (near the AI Assistant card / user profile) + `/wallet` page |

## Data Model Changes

### Remove
- `plans` table
- `subscriptions` table
- `/plans` frontend page, upgrade/plan modal, and any plan-based feature-limit checks.
- Plan references in `transactions` (see below).

### Add

**`users.walletBalance`** — `numeric(12,4)`, default `0`. User's current USD balance.

**`message_rates`** — admin-managed rate matrix.
| column | type | notes |
|--------|------|-------|
| id | varchar pk | |
| countryCode | varchar(2) | ISO-3166 alpha-2, e.g. `AE`, `IN` |
| category | varchar | `marketing` \| `utility` \| `authentication` |
| rate | numeric(10,4) | price in USD per message |
| createdAt / updatedAt | timestamp | |
Unique constraint: `(countryCode, category)`.

**`billing_settings`** — singleton config row.
| column | type | notes |
|--------|------|-------|
| id | varchar pk | |
| currency | varchar | fixed `USD` |
| defaultRate | numeric(10,4) | fallback when no matching rate |
| updatedAt | timestamp | |

**`wallet_transactions`** — ledger (audit + user history).
| column | type | notes |
|--------|------|-------|
| id | varchar pk | |
| userId | varchar fk → users | |
| type | varchar | `topup` \| `debit` \| `adjustment` |
| amount | numeric(12,4) | positive credit / negative debit |
| balanceAfter | numeric(12,4) | balance snapshot after this entry |
| messageId | varchar nullable | link to the charged message (debits) |
| country | varchar(2) nullable | for debits |
| category | varchar nullable | for debits |
| description | text | human-readable |
| createdAt | timestamp | |

**`transactions`** (existing) — reused for **top-up payments**. Drop the `planId` NOT NULL
reference; make it nullable/removed and add `type` = `topup`. Keep gateway/provider fields.

### Country derivation
Add **`libphonenumber-js`** (pure-JS, no native deps). Parse `recipientPhone` (E.164) →
ISO-2 country code. On parse failure → `null` → default rate path.

## Billing Service — single choke point

New `server/services/billing.service.ts`:

- `getMessageCost(phone, category) → { country, rate }`
  - Parse `phone` → country. Look up `message_rates(country, category)`.
  - Miss (or unparseable) → `billing_settings.defaultRate`.
- `chargeForMessage(userId, phone, category, messageId) → { charged, balanceAfter }`
  - Atomic DB transaction with row-level lock (`SELECT … FOR UPDATE` on the user row):
    balance check → deduct → insert `wallet_transactions` debit. Throws / returns failure
    if balance < cost.
- `credit(userId, amount, {type, description}) → balanceAfter` — for top-ups & manual admin adjustments.

### Hook point
Charge inside **`WhatsAppApiService.sendTemplateMessage()`** — the guaranteed central path
for all template/campaign sends (campaigns, single send, automation, API all route here):

1. **Before send:** compute cost + check balance. If insufficient → skip send, mark the
   message `failed` (reason `insufficient_balance`), do not call the WhatsApp API.
2. **After successful send:** call `chargeForMessage` (so failed API calls are never charged).

`WhatsAppApiService.sendMessage()` (free-form / session) → **no charge**.

## Admin Panel — Settings → "Billing / Message Rates"

- Global **default rate** + currency (USD, read-only).
- **Country rate table:** add a country (searchable ISO list); set its `marketing`,
  `utility`, `authentication` rates. Edit / delete rows.
- **User balances:** view any user's balance + **manual adjust** (credit/debit with a
  reason → writes a `wallet_transactions` `adjustment` entry).

## User Side

- **Sidebar wallet card** (positioned like the AI Assistant card, above the user/profile
  block): shows current balance (USD) + a **Top-up** button.
- **`/wallet`** page (replaces `/plans`):
  - Current balance.
  - Top-up: enter amount → pay via existing gateway flow.
  - **Transaction history:** top-ups + per-message debits (with country/category/description).
- Top-up success → gateway webhook → `credit()` + `transactions` row (`type: topup`).

## Edge Cases

- **Mid-campaign exhaustion:** once balance hits zero, remaining recipients are marked
  `failed (insufficient_balance)`; user is notified.
- **Concurrency:** deduction uses a per-user row lock so parallel sends can't oversell.
- **Refunds:** charge happens only after a successful WhatsApp send, so no refund path is
  needed for API failures.
- **Unparseable number:** default rate applies (never blocks on a parse quirk).

## Rollout / Migration

1. Schema migration: add new tables/columns; archive existing `subscriptions` data if any,
   then drop `plans` + `subscriptions`.
2. Seed `billing_settings` (currency `USD`, a sane `defaultRate`).
3. Optionally seed a starter `message_rates` set for common countries.
4. Deploy: rsync → `npm install` (adds libphonenumber-js) → `npm run build` →
   `npm run db:push --force` → `systemctl restart whatsway`.

## Out of Scope (YAGNI)

- Per-user / multi-currency wallets and FX conversion.
- Per-conversation (24h window) billing — we bill per outbound template message.
- Auto-recharge / low-balance auto top-up (can be a later enhancement).
