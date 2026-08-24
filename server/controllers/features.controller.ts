/**
 * Feature flags: a singleton row of on/off toggles for optional features.
 * GET is available to any authenticated user (so the UI can show/hide
 * features); PUT is superadmin-only.
 */
import type { Request, Response } from "express";
import { db } from "../db";
import { appFeatures, contacts, type AppFeatures } from "@shared/schema";
import { eq } from "drizzle-orm";

const KEYS = [
  "numberMasking",
  "googleSheets",
  "orderingBot",
  "customAttributes",
] as const;

export async function getFeaturesRow(): Promise<AppFeatures> {
  const [row] = await db.select().from(appFeatures).limit(1);
  if (row) return row;
  const [created] = await db.insert(appFeatures).values({}).returning();
  return created;
}

export async function getFeatures(_req: Request, res: Response) {
  res.json(await getFeaturesRow());
}

export async function updateFeatures(req: Request, res: Response) {
  const cur = await getFeaturesRow();
  const set: Record<string, any> = { updatedAt: new Date() };
  for (const k of KEYS) {
    if (typeof req.body?.[k] === "boolean") set[k] = req.body[k];
  }
  if (typeof req.body?.googleSheetsUrl === "string") {
    set.googleSheetsUrl = req.body.googleSheetsUrl.trim() || null;
  }
  const [row] = await db
    .update(appFeatures)
    .set(set)
    .where(eq(appFeatures.id, cur.id))
    .returning();
  res.json(row);
}

/**
 * Push all contacts to the configured Google Apps Script Web App, which appends
 * them to the linked Google Sheet. No Google API credentials needed on our side.
 */
export async function syncGoogleSheets(_req: Request, res: Response) {
  const cfg = await getFeaturesRow();
  if (!cfg.googleSheets) {
    return res.status(400).json({ error: "Google Sheets feature is disabled." });
  }
  const url = (cfg.googleSheetsUrl || "").trim();
  if (!url || !/^https:\/\/script\.google(usercontent)?\.com\//.test(url)) {
    return res.status(400).json({ error: "Set a valid Google Apps Script Web App URL first." });
  }

  const rows = await db
    .select({
      name: contacts.name,
      phone: contacts.phone,
      email: contacts.email,
      status: contacts.status,
      createdAt: contacts.createdAt,
    })
    .from(contacts);

  try {
    const resp = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        columns: ["name", "phone", "email", "status", "createdAt"],
        rows: rows.map((r) => [
          r.name,
          r.phone,
          r.email || "",
          r.status || "",
          r.createdAt ? new Date(r.createdAt).toISOString() : "",
        ]),
      }),
    });
    const text = await resp.text();
    if (!resp.ok) {
      return res.status(502).json({ error: `Google Script returned ${resp.status}: ${text.slice(0, 200)}` });
    }
    res.json({ ok: true, synced: rows.length });
  } catch (err: any) {
    res.status(502).json({ error: err?.message || "Failed to reach Google Script" });
  }
}
