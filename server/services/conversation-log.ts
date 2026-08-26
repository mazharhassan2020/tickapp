/**
 * Every outbound message must land in the inbox.
 *
 * Template sends happen from several places (campaign workers, the contacts
 * page, the REST API, API campaigns) and each used to log — or not log — its
 * own way. That is why campaign/template messages were missing from the chat
 * thread. This is the single place that:
 *
 *   1. finds or creates the contact for (phone, channel)
 *   2. finds or creates the conversation for (phone, channel)  ← channel-scoped,
 *      never by phone alone, or the message lands in another channel's thread
 *   3. inserts the outbound message row the inbox renders
 *   4. refreshes the conversation preview (lastMessageAt / lastMessageText)
 *   5. pushes it to any open inbox over the socket
 */
import { db } from "../db";
import { conversations, contacts, messages, templates } from "@shared/schema";
import { and, eq } from "drizzle-orm";

export interface OutboundLogInput {
  channelId: string;
  phone: string;
  content: string;
  /** "template" for template sends, "text" for free-form */
  messageType?: string;
  whatsappMessageId?: string | null;
  campaignId?: string | null;
  contactName?: string | null;
  /** "sent" (default) or "failed" */
  status?: string;
  /** who produced it: "campaign", "api", "agent" … */
  fromType?: string;
  fromUser?: boolean;
  errorCode?: string | null;
  errorMessage?: string | null;
  errorDetails?: any;
}

/** Body of a template, used as the message content when nothing better exists. */
export async function templateBodyFor(
  templateName?: string | null,
  channelId?: string | null
): Promise<string | null> {
  if (!templateName) return null;
  try {
    let row: { body: string } | undefined;
    if (channelId) {
      [row] = await db
        .select({ body: templates.body })
        .from(templates)
        .where(and(eq(templates.name, templateName), eq(templates.channelId, channelId)))
        .limit(1);
    }
    if (!row) {
      [row] = await db
        .select({ body: templates.body })
        .from(templates)
        .where(eq(templates.name, templateName))
        .limit(1);
    }
    return row?.body ?? null;
  } catch {
    return null;
  }
}

/** Fill {{1}}, {{2}} … from an ordered parameter list. */
export function renderTemplateBody(body: string, params?: (string | number | null | undefined)[]) {
  if (!body || !params?.length) return body;
  return params.reduce<string>(
    (out, value, i) => out.replaceAll(`{{${i + 1}}}`, String(value ?? "")),
    body
  );
}

export async function logOutboundMessage(input: OutboundLogInput) {
  const {
    channelId,
    phone,
    content,
    messageType = "template",
    whatsappMessageId = null,
    campaignId = null,
    contactName = null,
    status = "sent",
    fromType = "campaign",
    fromUser = false,
    errorCode = null,
    errorMessage = null,
    errorDetails = null,
  } = input;

  if (!channelId || !phone) return null;

  try {
    // ---- contact -------------------------------------------------------
    let [contact] = await db
      .select({ id: contacts.id, name: contacts.name })
      .from(contacts)
      .where(and(eq(contacts.channelId, channelId), eq(contacts.phone, phone)))
      .limit(1);

    if (!contact) {
      [contact] = await db
        .insert(contacts)
        .values({ name: contactName || phone, phone, channelId, status: "active" })
        .returning({ id: contacts.id, name: contacts.name });
    }

    // ---- conversation (always scoped to this channel) -------------------
    let [conversation] = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(and(eq(conversations.channelId, channelId), eq(conversations.contactPhone, phone)))
      .limit(1);

    if (!conversation) {
      [conversation] = await db
        .insert(conversations)
        .values({
          channelId,
          contactId: contact?.id,
          contactPhone: phone,
          contactName: contact?.name || contactName || phone,
          status: "open",
          type: "whatsapp",
          unreadCount: 0,
          lastMessageAt: new Date(),
          lastMessageText: content,
        })
        .returning({ id: conversations.id });
    }

    // ---- message --------------------------------------------------------
    const [message] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        campaignId,
        whatsappMessageId,
        content,
        type: messageType,
        messageType,
        direction: "outbound",
        fromUser,
        fromType,
        status,
        timestamp: new Date(),
        ...(errorCode ? { errorCode } : {}),
        ...(errorMessage ? { errorMessage } : {}),
        ...(errorDetails ? { errorDetails } : {}),
      })
      .returning();

    // ---- conversation preview + live update ------------------------------
    await db
      .update(conversations)
      .set({
        lastMessageAt: new Date(),
        lastMessageText: content,
        ...(contact?.id ? { contactId: contact.id } : {}),
      })
      .where(eq(conversations.id, conversation.id));

    const broadcast = (global as any).broadcastToConversation;
    if (typeof broadcast === "function") {
      try {
        broadcast(conversation.id, { type: "new-message", message });
      } catch (err) {
        console.warn("[conversation-log] socket broadcast failed:", err);
      }
    }

    return { conversationId: conversation.id, message };
  } catch (err) {
    // Logging must never break an actual send
    console.error("[conversation-log] failed to log outbound message:", err);
    return null;
  }
}
