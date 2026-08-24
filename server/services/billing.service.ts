/**
 * Prepaid billing: derive a recipient's country from their phone number,
 * look up the per-(country × category) rate (falling back to the admin
 * default rate), and atomically charge a user's wallet for a sent message.
 */
import { parsePhoneNumberFromString } from "libphonenumber-js";
import { walletRepository } from "../repositories/wallet.repository";
import { db } from "../db";
import { panelConfig } from "@shared/schema";
import { desc } from "drizzle-orm";

/** The wallet/billing currency follows the store's brand-settings currency. */
export async function getStoreCurrency(): Promise<string> {
  try {
    const [row] = await db
      .select({ currency: panelConfig.currency })
      .from(panelConfig)
      .orderBy(desc(panelConfig.createdAt))
      .limit(1);
    const cur = row?.currency;
    if (cur && String(cur).trim()) return String(cur).trim().toUpperCase();
  } catch (err) {
    console.error("[billing] getStoreCurrency failed:", err);
  }
  return "USD";
}

/** Normalize a message category to one of the billed buckets. */
export function normalizeCategory(category?: string | null): string {
  const c = (category ?? "").toLowerCase();
  if (c === "transactional") return "utility"; // legacy alias
  if (c === "marketing" || c === "utility" || c === "authentication") return c;
  return "marketing"; // safe default for unknown/undefined
}

/** ISO-3166 alpha-2 country from an E.164-ish phone, or null if unparseable. */
export function phoneToCountry(phone: string): string | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  const withPlus = trimmed.startsWith("+")
    ? trimmed
    : `+${trimmed.replace(/\D/g, "")}`;
  const parsed = parsePhoneNumberFromString(withPlus);
  return parsed?.country ?? null;
}

/** Resolve the price (USD) for a message to `phone` of the given category. */
export async function getMessageCost(
  phone: string,
  category: string
): Promise<{ country: string | null; rate: number }> {
  const cat = normalizeCategory(category);
  const country = phoneToCountry(phone);
  const settings = await walletRepository.getSettings();
  const defaultRate = Number(settings.defaultRate ?? 0);
  const markup = Number((settings as any).markup ?? 0);
  if (!country) return { country: null, rate: defaultRate + markup };
  const rates = await walletRepository.getRates();
  const match = rates.find(
    (r) => r.countryCode === country && r.category === cat
  );
  const base = match ? Number(match.rate) : defaultRate;
  return { country, rate: base + markup };
}

/**
 * Master switch for prepaid wallet billing. When the admin turns it off
 * (Settings -> Message Rates), balances are neither checked nor charged and
 * sending is governed by the subscription plan alone.
 */
export async function isWalletBillingEnabled(): Promise<boolean> {
  try {
    const settings = await walletRepository.getSettings();
    return (settings as any).walletBillingEnabled !== false;
  } catch (err) {
    console.error("[billing] isWalletBillingEnabled failed:", err);
    return true; // fail closed: keep charging rather than sending for free
  }
}

/** True if the user can afford one message of this category to this phone. */
export async function hasSufficientBalance(
  userId: string,
  phone: string,
  category: string
): Promise<{ ok: boolean; cost: number; country: string | null }> {
  if (!(await isWalletBillingEnabled())) {
    return { ok: true, cost: 0, country: phoneToCountry(phone) };
  }
  const { country, rate } = await getMessageCost(phone, category);
  if (rate <= 0) return { ok: true, cost: 0, country };
  const balance = await walletRepository.getBalance(userId);
  return { ok: balance >= rate, cost: rate, country };
}

/** Atomically charge the user for a successfully-sent message. */
export async function chargeForMessage(
  userId: string,
  phone: string,
  category: string,
  messageId?: string
): Promise<{ charged: boolean; cost: number; balanceAfter: number }> {
  if (!(await isWalletBillingEnabled())) {
    return {
      charged: true,
      cost: 0,
      balanceAfter: await walletRepository.getBalance(userId),
    };
  }
  const { country, rate } = await getMessageCost(phone, category);
  if (rate <= 0) {
    return {
      charged: true,
      cost: 0,
      balanceAfter: await walletRepository.getBalance(userId),
    };
  }
  const res = await walletRepository.deduct(userId, rate, {
    messageId,
    country: country ?? undefined,
    category: normalizeCategory(category),
    description: `Message to ${country ?? "unknown"} (${normalizeCategory(category)})`,
  });
  return { charged: res.ok, cost: rate, balanceAfter: res.balanceAfter };
}
