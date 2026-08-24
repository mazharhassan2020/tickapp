import { describe, it, expect, vi } from "vitest";

const rates = [{ countryCode: "AE", category: "marketing", rate: "0.20" }];
vi.mock("../repositories/wallet.repository", () => ({
  walletRepository: {
    getRates: vi.fn(async () => rates),
    getSettings: vi.fn(async () => ({ defaultRate: "0.10", currency: "USD" })),
    getBalance: vi.fn(async () => 5),
  },
}));

import {
  phoneToCountry,
  getMessageCost,
  normalizeCategory,
} from "../services/billing.service";

describe("phoneToCountry", () => {
  it("maps a UAE number to AE", () =>
    expect(phoneToCountry("+971501234567")).toBe("AE"));
  it("maps an Indian number (no plus) to IN", () =>
    expect(phoneToCountry("919812345678")).toBe("IN"));
  it("returns null for garbage", () => expect(phoneToCountry("12")).toBe(null));
});

describe("normalizeCategory", () => {
  it("maps transactional -> utility", () =>
    expect(normalizeCategory("transactional")).toBe("utility"));
  it("passes marketing through", () =>
    expect(normalizeCategory("marketing")).toBe("marketing"));
  it("defaults unknown to marketing", () =>
    expect(normalizeCategory(undefined)).toBe("marketing"));
});

describe("getMessageCost", () => {
  it("uses the exact country+category rate", async () => {
    expect(await getMessageCost("+971501234567", "marketing")).toEqual({
      country: "AE",
      rate: 0.2,
    });
  });
  it("falls back to default rate when no match", async () => {
    expect(await getMessageCost("+919812345678", "marketing")).toEqual({
      country: "IN",
      rate: 0.1,
    });
  });
  it("uses default rate for unparseable phone", async () => {
    expect(await getMessageCost("12", "marketing")).toEqual({
      country: null,
      rate: 0.1,
    });
  });
});
