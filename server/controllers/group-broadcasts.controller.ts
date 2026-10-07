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
 * What has been broadcast to a group, as a timeline.
 *
 * A campaign does not record which group it was built from - `contact_groups`
 * holds the resolved contact ids, not group ids - so the link is derived from
 * who actually received the message: every campaign with a queue row addressed
 * to a phone belonging to this group.
 *
 * That derivation is the honest one anyway. A contact can be added to or
 * removed from a group after a send, and the timeline should reflect what was
 * really delivered to the people in it rather than what the audience looked
 * like when the campaign was composed.
 *
 * Counts are DISTINCT on phone. A campaign can enqueue the same recipient more
 * than once (a resend, or the double-send seen in production), and counting
 * rows would report more recipients than the group has members.
 */

import type { Request, Response } from "express";
import { sql } from "drizzle-orm";
import { asyncHandler } from "../utils/async-handler";
import { storage } from "../storage";
import { dbRead } from "../db";
import { AppError } from "../middlewares/error.middleware";
import { sessionUser, ownerIdOf } from "../utils/tenant-scope";

/** Load the group and confirm the caller's tenant owns it. */
async function loadGroup(req: Request, groupId: string) {
  const rows: any = await dbRead.execute(sql`
    SELECT id, name, description, "channelId" AS channel_id, created_by
    FROM groups WHERE id = ${groupId} LIMIT 1
  `);
  const group = rows?.rows?.[0];
  if (!group) throw new AppError(404, "Group not found");

  const user = sessionUser(req);
  if (user?.role !== "superadmin") {
    const ownerId = ownerIdOf(user);
    if (!ownerId) throw new AppError(401, "Not authenticated");
    // A group belongs to whoever created it, or to the channel it sits on.
    if (group.created_by && group.created_by !== ownerId) {
      const channels = await storage.getChannelsByUserId(ownerId);
      if (!channels.some((ch: any) => ch.id === group.channel_id)) {
        throw new AppError(403, "Access denied");
      }
    }
  }
  return group;
}

/** Digits-only comparison, so +971 50…, 971-50… and 97150… are one number. */
const DIGITS = (col: string) => sql.raw(`regexp_replace(${col}, '[^0-9]', '', 'g')`);

export const groupBroadcastsController = {
  /**
   * GET /api/groups/:id/broadcasts
   *
   * The campaigns delivered to this group, newest first, each with the stats
   * for this group's members only.
   */
  getBroadcasts: asyncHandler(async (req: Request, res: Response) => {
    const group = await loadGroup(req, req.params.id);
    const limit = Math.min(
      100,
      Math.max(1, parseInt(String(req.query.limit || "30"), 10) || 30)
    );

    const result: any = await dbRead.execute(sql`
      WITH members AS (
        SELECT DISTINCT ${DIGITS("phone")} AS ph
        FROM contacts
        WHERE groups @> to_jsonb(${group.name}::text)
      ),
      -- Inbound messages on this channel, for the reply counts. Bounded to the
      -- channel so one tenant's replies can never land in another's figures.
      replies AS (
        SELECT ${DIGITS("conv.contact_phone")} AS ph, MIN(m.created_at) AS replied_at
        FROM messages m
        JOIN conversations conv ON conv.id = m.conversation_id
        WHERE m.direction = 'inbound'
          AND conv.channel_id = ${group.channel_id}
        GROUP BY 1
      ),
      -- One row per (campaign, recipient): a resend must not count twice.
      per_recipient AS (
        SELECT DISTINCT ON (q.campaign_id, ${DIGITS("q.recipient_phone")})
               q.campaign_id,
               ${DIGITS("q.recipient_phone")} AS ph,
               q.status, q.processed_at, q.delivered_at, q.read_at
        FROM message_queue q
        JOIN members mem ON mem.ph = ${DIGITS("q.recipient_phone")}
        WHERE q.campaign_id IS NOT NULL
        ORDER BY q.campaign_id, ${DIGITS("q.recipient_phone")},
                 q.delivered_at DESC NULLS LAST, q.processed_at DESC NULLS LAST
      )
      SELECT
        c.id,
        c.name,
        c.template_name            AS "templateName",
        c.status,
        c.created_at               AS "createdAt",
        c.scheduled_at             AS "scheduledAt",
        t.body                     AS "templateBody",
        t.header                   AS "templateHeader",
        t.footer                   AS "templateFooter",
        t.language                 AS "templateLanguage",
        COUNT(*)::int                                                   AS "audience",
        COUNT(*) FILTER (WHERE p.status <> 'failed')::int               AS "sent",
        COUNT(*) FILTER (WHERE p.delivered_at IS NOT NULL)::int         AS "delivered",
        COUNT(*) FILTER (WHERE p.read_at IS NOT NULL)::int              AS "read",
        COUNT(*) FILTER (WHERE p.delivered_at IS NOT NULL
                           AND p.read_at IS NULL)::int                  AS "unread",
        COUNT(*) FILTER (WHERE p.status = 'failed')::int                AS "failed",
        COUNT(*) FILTER (WHERE r.replied_at IS NOT NULL
                           AND (p.processed_at IS NULL
                                OR r.replied_at >= p.processed_at))::int AS "replied"
      FROM per_recipient p
      JOIN campaigns c ON c.id = p.campaign_id
      LEFT JOIN templates t
        ON t.name = c.template_name AND t.channel_id = c.channel_id
      LEFT JOIN replies r ON r.ph = p.ph
      GROUP BY c.id, c.name, c.template_name, c.status, c.created_at,
               c.scheduled_at, t.body, t.header, t.footer, t.language
      ORDER BY c.created_at DESC
      LIMIT ${limit}
    `);

    const memberCount: any = await dbRead.execute(sql`
      SELECT COUNT(*)::int AS n FROM contacts
      WHERE groups @> to_jsonb(${group.name}::text)
    `);

    const broadcasts = (result?.rows || []).map((row: any) => ({
      ...row,
      // "No response" is everyone reached who never wrote back - the figure an
      // agent chases, and the one DoubleTick surfaces alongside the rest.
      noResponse: Math.max(0, Number(row.sent) - Number(row.replied)),
    }));

    res.json({
      group: {
        id: group.id,
        name: group.name,
        description: group.description,
        channelId: group.channel_id,
        memberCount: memberCount?.rows?.[0]?.n ?? 0,
      },
      broadcasts,
    });
  }),

  /**
   * GET /api/groups/:id/broadcasts/:campaignId/recipients?bucket=read
   *
   * The people behind one number on a broadcast, so a stat can be opened
   * rather than just read.
   */
  getBroadcastRecipients: asyncHandler(async (req: Request, res: Response) => {
    const group = await loadGroup(req, req.params.id);
    const bucket = String(req.query.bucket || "sent");
    const allowed = [
      "sent", "delivered", "read", "unread", "failed", "replied", "noResponse",
    ];
    if (!allowed.includes(bucket)) {
      throw new AppError(400, `bucket must be one of: ${allowed.join(", ")}`);
    }

    const having = {
      sent: sql`p.status <> 'failed'`,
      delivered: sql`p.delivered_at IS NOT NULL`,
      read: sql`p.read_at IS NOT NULL`,
      unread: sql`p.delivered_at IS NOT NULL AND p.read_at IS NULL`,
      failed: sql`p.status = 'failed'`,
      replied: sql`r.replied_at IS NOT NULL
                   AND (p.processed_at IS NULL OR r.replied_at >= p.processed_at)`,
      noResponse: sql`p.status <> 'failed'
                      AND (r.replied_at IS NULL
                           OR (p.processed_at IS NOT NULL
                               AND r.replied_at < p.processed_at))`,
    }[bucket]!;

    const result: any = await dbRead.execute(sql`
      WITH members AS (
        SELECT DISTINCT ${DIGITS("phone")} AS ph
        FROM contacts WHERE groups @> to_jsonb(${group.name}::text)
      ),
      replies AS (
        SELECT ${DIGITS("conv.contact_phone")} AS ph, MIN(m.created_at) AS replied_at
        FROM messages m
        JOIN conversations conv ON conv.id = m.conversation_id
        WHERE m.direction = 'inbound' AND conv.channel_id = ${group.channel_id}
        GROUP BY 1
      ),
      per_recipient AS (
        SELECT DISTINCT ON (${DIGITS("q.recipient_phone")})
               ${DIGITS("q.recipient_phone")} AS ph,
               q.recipient_phone, q.status, q.processed_at,
               q.delivered_at, q.read_at, q.error_message
        FROM message_queue q
        JOIN members mem ON mem.ph = ${DIGITS("q.recipient_phone")}
        WHERE q.campaign_id = ${req.params.campaignId}
        ORDER BY ${DIGITS("q.recipient_phone")},
                 q.delivered_at DESC NULLS LAST, q.processed_at DESC NULLS LAST
      )
      SELECT p.recipient_phone AS phone, p.status, p.processed_at AS "sentAt",
             p.delivered_at AS "deliveredAt", p.read_at AS "readAt",
             p.error_message AS "errorMessage",
             r.replied_at AS "repliedAt",
             (SELECT ct.name FROM contacts ct
               WHERE ${DIGITS("ct.phone")} = p.ph
                 AND ct.groups @> to_jsonb(${group.name}::text)
               LIMIT 1) AS name
      FROM per_recipient p
      LEFT JOIN replies r ON r.ph = p.ph
      WHERE ${having}
      ORDER BY p.delivered_at DESC NULLS LAST, p.recipient_phone
      LIMIT 500
    `);

    res.json({ bucket, recipients: result?.rows || [] });
  }),
};
