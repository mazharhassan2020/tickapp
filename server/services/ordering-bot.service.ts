/**
 * Automated ordering bot. Runs a simple stateful WhatsApp flow:
 *   greeting/"order"/"menu" -> product list -> pick number -> quantity ->
 *   add more or "done" -> confirm -> order saved + admin notified.
 *
 * Activated only when the `orderingBot` feature flag is ON. Fully guarded so
 * a failure never breaks normal inbound message handling.
 */
import { db } from "../db";
import { and, eq, asc } from "drizzle-orm";
import {
  orderProducts,
  orderSessions,
  orders,
  type Channel,
} from "@shared/schema";
import { WhatsAppApiService } from "./whatsapp-api";
import { getFeaturesRow } from "../controllers/features.controller";
import { triggerNotification, NOTIFICATION_EVENTS } from "./notification.service";

const TRIGGERS = ["order", "menu", "start", "buy", "hi", "hello"];

type CartItem = { productId: string; name: string; price: string; qty: number };

function money(n: number): string {
  return n.toFixed(2);
}

async function reply(channel: Channel, to: string, text: string) {
  const api = new WhatsAppApiService(channel);
  await api.sendTextMessage(to, text);
}

async function getSession(channelId: string, phone: string) {
  const [s] = await db
    .select()
    .from(orderSessions)
    .where(
      and(
        eq(orderSessions.channelId, channelId),
        eq(orderSessions.contactPhone, phone)
      )
    );
  return s || null;
}

async function upsertSession(
  channelId: string,
  phone: string,
  fields: { step: string; pendingProductId?: string | null; cart?: CartItem[] }
) {
  const existing = await getSession(channelId, phone);
  if (existing) {
    await db
      .update(orderSessions)
      .set({
        step: fields.step,
        pendingProductId: fields.pendingProductId ?? null,
        cart: fields.cart ?? (existing.cart as CartItem[]) ?? [],
        updatedAt: new Date(),
      })
      .where(eq(orderSessions.id, existing.id));
  } else {
    await db.insert(orderSessions).values({
      channelId,
      contactPhone: phone,
      step: fields.step,
      pendingProductId: fields.pendingProductId ?? null,
      cart: fields.cart ?? [],
    });
  }
}

async function clearSession(channelId: string, phone: string) {
  await db
    .delete(orderSessions)
    .where(
      and(
        eq(orderSessions.channelId, channelId),
        eq(orderSessions.contactPhone, phone)
      )
    );
}

async function listProducts(channelId: string) {
  const rows = await db
    .select()
    .from(orderProducts)
    .where(eq(orderProducts.active, true))
    .orderBy(asc(orderProducts.sortOrder), asc(orderProducts.name));
  // channel-specific first, else global (null channelId)
  const scoped = rows.filter((r) => r.channelId === channelId);
  return scoped.length ? scoped : rows.filter((r) => !r.channelId);
}

function productMenuText(products: { name: string; price: string }[]): string {
  const lines = products.map(
    (p, i) => `${i + 1}. ${p.name} — ${money(Number(p.price))}`
  );
  return (
    "🛒 *Menu* — reply with the item number to add it:\n\n" +
    lines.join("\n") +
    "\n\nSend *done* to checkout or *cancel* to stop."
  );
}

function cartSummary(cart: CartItem[]): { text: string; total: number } {
  let total = 0;
  const lines = cart.map((c) => {
    const line = Number(c.price) * c.qty;
    total += line;
    return `• ${c.name} × ${c.qty} = ${money(line)}`;
  });
  return { text: lines.join("\n"), total };
}

/**
 * Returns true if the ordering bot handled (and replied to) this message.
 */
export async function maybeHandleOrder(
  channel: Channel,
  fromPhone: string,
  text: string,
  contactName?: string
): Promise<boolean> {
  try {
    const features = await getFeaturesRow();
    if (!features.orderingBot) return false;

    const msg = (text || "").trim();
    const lower = msg.toLowerCase();
    const channelId = channel.id;
    const session = await getSession(channelId, fromPhone);

    // Global cancel
    if (lower === "cancel") {
      if (session) {
        await clearSession(channelId, fromPhone);
        await reply(channel, fromPhone, "Order cancelled. Send *order* to start again.");
        return true;
      }
      return false;
    }

    // Start / no active session
    if (!session || session.step === "idle") {
      if (!TRIGGERS.includes(lower)) return false; // let AI/agents handle other messages
      const products = await listProducts(channelId);
      if (!products.length) return false; // no catalog configured -> don't hijack
      await upsertSession(channelId, fromPhone, { step: "selecting", cart: [] });
      await reply(
        channel,
        fromPhone,
        `👋 Welcome${contactName ? " " + contactName : ""}!\n\n` +
          productMenuText(products)
      );
      return true;
    }

    const cart: CartItem[] = (session.cart as CartItem[]) || [];

    if (session.step === "selecting") {
      if (lower === "done") {
        if (!cart.length) {
          await reply(channel, fromPhone, "Your cart is empty. Send an item number to add something.");
          return true;
        }
        const { text: sumText, total } = cartSummary(cart);
        await upsertSession(channelId, fromPhone, { step: "confirm", cart });
        await reply(
          channel,
          fromPhone,
          `🧾 *Your order:*\n${sumText}\n\n*Total: ${money(total)}*\n\nReply *yes* to confirm or *no* to cancel.`
        );
        return true;
      }
      const products = await listProducts(channelId);
      const idx = parseInt(msg, 10);
      if (!isNaN(idx) && idx >= 1 && idx <= products.length) {
        const p = products[idx - 1];
        await upsertSession(channelId, fromPhone, {
          step: "quantity",
          pendingProductId: p.id,
          cart,
        });
        await reply(channel, fromPhone, `How many *${p.name}* would you like? (send a number)`);
        return true;
      }
      await reply(channel, fromPhone, "Please reply with a valid item number, or *done* to checkout.");
      return true;
    }

    if (session.step === "quantity") {
      const qty = parseInt(msg, 10);
      if (isNaN(qty) || qty < 1) {
        await reply(channel, fromPhone, "Please send a valid quantity (a number greater than 0).");
        return true;
      }
      const products = await listProducts(channelId);
      const p = products.find((x) => x.id === session.pendingProductId);
      if (!p) {
        await upsertSession(channelId, fromPhone, { step: "selecting", cart });
        await reply(channel, fromPhone, "That item is no longer available. Pick another number.");
        return true;
      }
      const existing = cart.find((c) => c.productId === p.id);
      if (existing) existing.qty += qty;
      else cart.push({ productId: p.id, name: p.name, price: String(p.price), qty });
      await upsertSession(channelId, fromPhone, { step: "selecting", pendingProductId: null, cart });
      const { total } = cartSummary(cart);
      await reply(
        channel,
        fromPhone,
        `✅ Added ${qty} × ${p.name}. Cart total: ${money(total)}.\n\nSend another item number, or *done* to checkout.`
      );
      return true;
    }

    if (session.step === "confirm") {
      if (lower === "yes" || lower === "y") {
        const { total } = cartSummary(cart);
        const [order] = await db
          .insert(orders)
          .values({
            channelId,
            contactPhone: fromPhone,
            contactName: contactName || null,
            items: cart,
            total: money(total),
            status: "new",
          })
          .returning();
        await clearSession(channelId, fromPhone);
        await reply(
          channel,
          fromPhone,
          `🎉 Thank you! Your order *#${order.id.slice(0, 8)}* is placed.\nTotal: ${money(total)}.\nWe'll be in touch shortly.`
        );
        try {
          await triggerNotification(NOTIFICATION_EVENTS.NEW_MESSAGE, {
            title: "New order received",
            body: `${contactName || fromPhone} placed an order of ${money(total)}`,
          } as any);
        } catch {}
        return true;
      }
      if (lower === "no" || lower === "n") {
        await clearSession(channelId, fromPhone);
        await reply(channel, fromPhone, "No problem, order cancelled. Send *order* to start again.");
        return true;
      }
      await reply(channel, fromPhone, "Please reply *yes* to confirm or *no* to cancel.");
      return true;
    }

    return false;
  } catch (err) {
    console.error("[OrderingBot] error (non-blocking):", err);
    return false;
  }
}
