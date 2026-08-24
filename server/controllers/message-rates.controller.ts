/**
 * Admin (superadmin) management of the per-(country × category) message-rate
 * matrix, the global billing settings (default rate), and manual wallet
 * adjustments for a user.
 */
import type { Request, Response } from "express";
import { walletRepository } from "../repositories/wallet.repository";
import { getStoreCurrency } from "../services/billing.service";

const CATEGORIES = ["marketing", "utility", "authentication"];

export async function listRates(_req: Request, res: Response) {
  res.json(await walletRepository.getRates());
}

export async function upsertRate(req: Request, res: Response) {
  const { countryCode, category, rate } = req.body;
  if (
    !countryCode ||
    !CATEGORIES.includes(category) ||
    rate == null ||
    Number(rate) < 0 ||
    Number.isNaN(Number(rate))
  ) {
    return res.status(400).json({ error: "Invalid rate payload" });
  }
  const row = await walletRepository.upsertRate(
    String(countryCode).toUpperCase(),
    category,
    String(rate)
  );
  res.json(row);
}

export async function deleteRate(req: Request, res: Response) {
  await walletRepository.deleteRate(req.params.id);
  res.json({ ok: true });
}

/**
 * Bulk upsert rates. Each row's final rate = base rate + markup.
 * body: { rows: [{ countryCode, category, rate }], markup?: number }
 */
export async function bulkUpsertRates(req: Request, res: Response) {
  const { rows, markup } = req.body as {
    rows: Array<{ countryCode: string; category: string; rate: number | string }>;
    markup?: number | string;
  };
  if (!Array.isArray(rows) || rows.length === 0) {
    return res.status(400).json({ error: "rows array required" });
  }
  const add = Number(markup ?? 0) || 0;
  let saved = 0;
  const skipped: string[] = [];
  for (const r of rows) {
    const cc = String(r.countryCode || "").trim().toUpperCase();
    const cat = String(r.category || "").trim().toLowerCase();
    const base = Number(r.rate);
    if (cc.length !== 2 || !CATEGORIES.includes(cat) || Number.isNaN(base) || base < 0) {
      skipped.push(`${r.countryCode}/${r.category}/${r.rate}`);
      continue;
    }
    const final = (base + add).toFixed(4);
    await walletRepository.upsertRate(cc, cat, final);
    saved++;
  }
  res.json({ saved, skipped });
}

export async function getBillingSettings(_req: Request, res: Response) {
  const settings = await walletRepository.getSettings();
  const currency = await getStoreCurrency();
  res.json({ ...settings, currency });
}

export async function updateBillingSettings(req: Request, res: Response) {
  const { defaultRate, markup, walletBillingEnabled } = req.body;
  const fields: {
    defaultRate?: string;
    markup?: string;
    walletBillingEnabled?: boolean;
  } = {};
  if (walletBillingEnabled !== undefined) {
    if (typeof walletBillingEnabled !== "boolean") {
      return res.status(400).json({ error: "walletBillingEnabled must be a boolean" });
    }
    fields.walletBillingEnabled = walletBillingEnabled;
  }
  if (defaultRate !== undefined) {
    if (Number(defaultRate) < 0 || Number.isNaN(Number(defaultRate))) {
      return res.status(400).json({ error: "Invalid defaultRate" });
    }
    fields.defaultRate = String(defaultRate);
  }
  if (markup !== undefined) {
    if (Number(markup) < 0 || Number.isNaN(Number(markup))) {
      return res.status(400).json({ error: "Invalid markup" });
    }
    fields.markup = String(markup);
  }
  if (Object.keys(fields).length === 0) {
    return res.status(400).json({ error: "Nothing to update" });
  }
  res.json(await walletRepository.updateSettings(fields));
}

export async function getUserWallet(req: Request, res: Response) {
  const userId = req.params.userId;
  if (!userId) return res.status(400).json({ error: "userId required" });
  const [balance, transactions, currency] = await Promise.all([
    walletRepository.getBalance(userId),
    walletRepository.listTransactions(userId, 100),
    getStoreCurrency(),
  ]);
  res.json({ balance, currency, transactions });
}

export async function adjustWallet(req: Request, res: Response) {
  const { userId, amount, description } = req.body;
  if (!userId || amount == null || Number.isNaN(Number(amount)) || Number(amount) === 0) {
    return res.status(400).json({ error: "userId and non-zero numeric amount required" });
  }
  const r = await walletRepository.credit(userId, Number(amount), {
    type: "adjustment",
    description: description || "Admin adjustment",
  });
  res.json({ balanceAfter: r.balanceAfter });
}
