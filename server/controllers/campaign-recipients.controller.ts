/**
 * ============================================================
 * © 2025 Diploy — a brand of Bisht Technologies Private Limited
 * Original Author: BTPL Engineering Team
 * Website: https://diploy.in
 * Contact: cs@diploy.in
 *
 * Distributed under the Envato / CodeCanyon License Agreement.
 * Licensed to the purchaser for use as defined by the
 * Envato Market (CodeCanyon) Regular or Extended License.
 *
 * You are NOT permitted to redistribute, resell, sublicense,
 * or share this source code, in whole or in part.
 * Respect the author's rights and Envato licensing terms.
 * ============================================================
 */

/**
 * Per-recipient view of a campaign: who it was sent to, who received it, who
 * read it, who replied, and why the rest failed.
 *
 * Source of truth is `message_queue`, not `campaign_recipients`. The latter is
 * declared in the schema but the send path never writes to it (it holds zero
 * rows in production), whereas `message_queue` has exactly one row per
 * recipient per campaign and its `status`/`delivered_at`/`read_at` are the
 * columns the WhatsApp webhook keeps up to date.
 *
 * Two things are joined on:
 *   - the recipient's name, which lives on `contacts` (the queue stores only a
 *     phone number)
 *   - replies, which WhatsApp reports as ordinary inbound messages rather than
 *     as a status on the original send, so "replied" is derived: the first
 *     inbound message on the campaign's channel from that number, at or after
 *     the moment we sent to them
 *
 * Phone numbers are compared on digits only. They are stored without a `+`
 * today, but contacts arrive from CSV imports in mixed shapes, so normalising
 * is what makes `+91 98…`, `91-98…` and `9198…` the same person.
 */

import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { asyncHandler } from "../utils/async-handler";
import { storage } from "../storage";
import { dbRead } from "../db";
import { AppError } from "../middlewares/error.middleware";
import { sessionUser, ownerIdOf } from "../utils/tenant-scope";

/** Hard ceiling on an export, so one click cannot stream the whole database. */
const MAX_EXPORT_ROWS = 50000;
const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 200;

/** `message_queue.status` values, plus the derived `replied`. */
const STATUS_FILTERS = [
  "all",
  "pending",
  "sent",
  "delivered",
  "read",
  "replied",
  "failed",
] as const;
type StatusFilter = (typeof STATUS_FILTERS)[number];

type ColumnKey =
  | "name"
  | "phone"
  | "status"
  | "sentAt"
  | "deliveredAt"
  | "readAt"
  | "repliedAt"
  | "errorCode"
  | "errorMessage"
  | "cost"
  | "whatsappMessageId";

/** Column order here is the column order in the CSV. */
const EXPORT_COLUMNS: { key: ColumnKey; header: string }[] = [
  { key: "name", header: "Name" },
  { key: "phone", header: "Phone" },
  { key: "status", header: "Status" },
  { key: "sentAt", header: "Sent At" },
  { key: "deliveredAt", header: "Delivered At" },
  { key: "readAt", header: "Read At" },
  { key: "repliedAt", header: "Replied At" },
  { key: "errorCode", header: "Error Code" },
  { key: "errorMessage", header: "Error Message" },
  { key: "cost", header: "Cost" },
  { key: "whatsappMessageId", header: "WhatsApp Message ID" },
];

/**
 * Load the campaign and confirm the caller's tenant owns it.
 *
 * Mirrors `campaignsController.getCampaign`: a superadmin sees everything, and
 * anyone else must own the channel the campaign was sent on.
 */
async function loadCampaignForRequest(req: Request, campaignId: string) {
  const campaign = await storage.getCampaign(campaignId);
  if (!campaign) throw new AppError(404, "Campaign not found");

  const user = sessionUser(req);
  if (user?.role !== "superadmin" && campaign.channelId) {
    const ownerId = ownerIdOf(user);
    if (!ownerId) throw new AppError(401, "Not authenticated");
    const channels = await storage.getChannelsByUserId(ownerId);
    if (!channels.some((ch: any) => ch.id === campaign.channelId)) {
      throw new AppError(403, "Access denied");
    }
  }

  return campaign;
}

function parseStatus(raw: unknown): StatusFilter {
  const value = String(raw || "all");
  return (STATUS_FILTERS as readonly string[]).includes(value)
    ? (value as StatusFilter)
    : "all";
}

/** `regexp_replace(<col>, …)` — digits of a phone number, for comparisons. */
function digitsOf(column: ReturnType<typeof sql.raw>) {
  return sql`regexp_replace(${column}, '[^0-9]', '', 'g')`;
}

/**
 * One row per recipient of the campaign.
 *
 * Exported so a test can serialise the SQL without a live request.
 *
 * Both joined CTEs are scoped to the campaign's own channel, which keeps them
 * small and stops one tenant's replies or contacts from leaking into another's
 * campaign. `DISTINCT ON` is not cosmetic: a channel can hold two contacts
 * whose numbers normalise to the same digits, and a plain join would then
 * report that recipient twice.
 */
export function recipientRowsSql(
  campaignId: string,
  channelId: string | null,
  since: Date | null
) {
  const queuePhone = digitsOf(sql.raw("q.recipient_phone"));

  // No channel on the campaign: nothing to match names or replies against.
  const noRows = (cols: string) => sql.raw(`SELECT ${cols} WHERE false`);

  const repliesCte = channelId
    ? sql`
        SELECT ${digitsOf(sql.raw("conv.contact_phone"))} AS phone_digits,
               MIN(m.created_at) AS replied_at
        FROM messages m
        JOIN conversations conv ON conv.id = m.conversation_id
        WHERE m.direction = 'inbound'
          AND conv.channel_id = ${channelId}
          AND m.created_at >= ${since ?? new Date(0)}
        GROUP BY 1
      `
    : noRows("NULL::text AS phone_digits, NULL::timestamptz AS replied_at");

  const namesCte = channelId
    ? sql`
        SELECT DISTINCT ON (${digitsOf(sql.raw("ct.phone"))})
               ${digitsOf(sql.raw("ct.phone"))} AS phone_digits,
               ct.name AS name
        FROM contacts ct
        WHERE ct.channel_id = ${channelId}
        ORDER BY ${digitsOf(sql.raw("ct.phone"))}, ct.updated_at DESC NULLS LAST
      `
    : noRows("NULL::text AS phone_digits, NULL::text AS name");

  return sql`
    WITH replies AS (${repliesCte}),
         contact_names AS (${namesCte})
    SELECT
      q.id,
      cn.name,
      q.recipient_phone      AS phone,
      q.status,
      q.processed_at         AS "sentAt",
      q.delivered_at         AS "deliveredAt",
      q.read_at              AS "readAt",
      q.error_code           AS "errorCode",
      q.error_message        AS "errorMessage",
      q.cost,
      q.whatsapp_message_id  AS "whatsappMessageId",
      CASE
        WHEN rp.replied_at IS NOT NULL
         AND (q.processed_at IS NULL OR rp.replied_at >= q.processed_at)
        THEN rp.replied_at
      END AS "repliedAt"
    FROM message_queue q
    LEFT JOIN contact_names cn ON cn.phone_digits = ${queuePhone}
    LEFT JOIN replies rp       ON rp.phone_digits = ${queuePhone}
    WHERE q.campaign_id = ${campaignId}
  `;
}

/**
 * `WHERE` fragment applied on top of the derived rows.
 *
 * Exported alongside `recipientRowsSql` for the same reason.
 */
export function filterSql(status: StatusFilter, search: string) {
  const clauses = [sql`TRUE`];

  if (status === "replied") {
    clauses.push(sql`r."repliedAt" IS NOT NULL`);
  } else if (status !== "all") {
    clauses.push(sql`r.status = ${status}`);
  }

  if (search) {
    const like = `%${search.toLowerCase()}%`;
    // Searching a phone on digits too, so "98 76" finds "9876…".
    const searchDigits = search.replace(/\D/g, "");
    const phoneClause = searchDigits
      ? sql` OR ${digitsOf(sql.raw('r.phone'))} LIKE ${`%${searchDigits}%`}`
      : sql``;
    clauses.push(
      sql`(LOWER(COALESCE(r.name, '')) LIKE ${like} OR LOWER(r.phone) LIKE ${like}${phoneClause})`
    );
  }

  return sql.join(clauses, sql` AND `);
}

export const campaignRecipientsController = {
  /**
   * GET /api/campaigns/:id/recipients
   *
   * Paginated recipients plus the per-status counts the filter tabs display.
   */
  getRecipients: asyncHandler(async (req: Request, res: Response) => {
    const campaign = await loadCampaignForRequest(req, req.params.id);

    const status = parseStatus(req.query.status);
    const search = String(req.query.search || "").trim();
    const page = Math.max(1, parseInt(String(req.query.page || "1"), 10) || 1);
    const limit = Math.min(
      MAX_PAGE_SIZE,
      Math.max(
        1,
        parseInt(String(req.query.limit || DEFAULT_PAGE_SIZE), 10) ||
          DEFAULT_PAGE_SIZE
      )
    );
    const offset = (page - 1) * limit;

    const rows = recipientRowsSql(
      campaign.id,
      campaign.channelId || null,
      campaign.createdAt ? new Date(campaign.createdAt) : null
    );

    // Counts ignore the status filter (so every tab shows its own total) but
    // honour the search box, which is what the numbers next to the tabs mean.
    const searchOnly = filterSql("all", search);
    const countsResult: any = await dbRead.execute(sql`
      WITH r AS (${rows})
      SELECT
        COUNT(*)::int                                          AS "all",
        COUNT(*) FILTER (WHERE r.status = 'pending')::int      AS "pending",
        COUNT(*) FILTER (WHERE r.status = 'sent')::int         AS "sent",
        COUNT(*) FILTER (WHERE r.status = 'delivered')::int    AS "delivered",
        COUNT(*) FILTER (WHERE r.status = 'read')::int         AS "read",
        COUNT(*) FILTER (WHERE r."repliedAt" IS NOT NULL)::int AS "replied",
        COUNT(*) FILTER (WHERE r.status = 'failed')::int       AS "failed"
      FROM r
      WHERE ${searchOnly}
    `);
    const counts = countsResult?.rows?.[0] || {};

    const where = filterSql(status, search);
    const pageResult: any = await dbRead.execute(sql`
      WITH r AS (${rows})
      SELECT r.*
      FROM r
      WHERE ${where}
      ORDER BY r."sentAt" DESC NULLS LAST, r.phone ASC
      LIMIT ${limit} OFFSET ${offset}
    `);

    const total = Number((counts as any)[status] ?? 0);

    res.json({
      recipients: pageResult?.rows || [],
      counts,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit)),
    });
  }),

  /**
   * GET /api/campaigns/:id/recipients/export
   *
   * CSV of the same rows, honouring the current status filter and search, with
   * the caller choosing the columns (`?columns=name,phone,readAt`).
   */
  exportRecipients: asyncHandler(async (req: Request, res: Response) => {
    const campaign = await loadCampaignForRequest(req, req.params.id);

    const status = parseStatus(req.query.status);
    const search = String(req.query.search || "").trim();

    const requested = String(req.query.columns || "")
      .split(",")
      .map((c) => c.trim())
      .filter(Boolean);
    // Filtering the known list (rather than trusting the input) keeps the
    // caller from naming a column that is not theirs to read.
    const columns = requested.length
      ? EXPORT_COLUMNS.filter((c) => requested.includes(c.key))
      : EXPORT_COLUMNS;
    if (columns.length === 0) {
      throw new AppError(400, "No valid columns requested");
    }

    const rows = recipientRowsSql(
      campaign.id,
      campaign.channelId || null,
      campaign.createdAt ? new Date(campaign.createdAt) : null
    );
    const where = filterSql(status, search);

    const result: any = await dbRead.execute(sql`
      WITH r AS (${rows})
      SELECT r.*
      FROM r
      WHERE ${where}
      ORDER BY r."sentAt" DESC NULLS LAST, r.phone ASC
      LIMIT ${MAX_EXPORT_ROWS}
    `);
    const recipients: any[] = result?.rows || [];

    const filenameBase = `campaign-${safeFilename(campaign.name || "export")}-recipients`;
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${filenameBase}.csv"`
    );
    res.send(toCsv(columns, recipients));
  }),
};

/** Excel opens a CSV correctly only with a BOM and CRLF line endings. */
function toCsv(columns: { key: ColumnKey; header: string }[], rows: any[]) {
  const lines = [columns.map((c) => csvEscape(c.header)).join(",")];
  for (const row of rows) {
    lines.push(columns.map((c) => csvEscape(row[c.key])).join(","));
  }
  return "﻿" + lines.join("\r\n") + "\r\n";
}

function csvEscape(value: unknown): string {
  if (value === null || value === undefined) return "";
  const s =
    value instanceof Date
      ? value.toISOString()
      : typeof value === "string"
        ? value
        : String(value);
  // A leading =, +, - or @ makes Excel treat the cell as a formula.
  const guarded = /^[=+\-@]/.test(s) ? `'${s}` : s;
  if (/[",\r\n]/.test(guarded)) return '"' + guarded.replace(/"/g, '""') + '"';
  return guarded;
}

function safeFilename(name: string) {
  return name.replace(/[^a-z0-9._-]+/gi, "-").slice(0, 60) || "export";
}
