/**
 * Admin management for the ordering bot: product catalog CRUD and order list.
 * All routes are superadmin/admin gated in ordering.routes.
 */
import type { Request, Response } from "express";
import { db } from "../db";
import { orderProducts, orders } from "@shared/schema";
import { and, desc, eq } from "drizzle-orm";

export async function listProducts(_req: Request, res: Response) {
  const rows = await db
    .select()
    .from(orderProducts)
    .orderBy(orderProducts.sortOrder, orderProducts.name);
  res.json(rows);
}

export async function createProduct(req: Request, res: Response) {
  const { name, price, description, channelId, sortOrder } = req.body;
  if (!name || price == null || Number.isNaN(Number(price))) {
    return res.status(400).json({ error: "name and numeric price required" });
  }
  const [row] = await db
    .insert(orderProducts)
    .values({
      name: String(name),
      price: String(price),
      description: description || null,
      channelId: channelId || null,
      sortOrder: Number(sortOrder) || 0,
    })
    .returning();
  res.json(row);
}

export async function updateProduct(req: Request, res: Response) {
  const { name, price, description, active, sortOrder } = req.body;
  const set: Record<string, any> = {};
  if (name !== undefined) set.name = String(name);
  if (price !== undefined) set.price = String(price);
  if (description !== undefined) set.description = description;
  if (active !== undefined) set.active = !!active;
  if (sortOrder !== undefined) set.sortOrder = Number(sortOrder) || 0;
  const [row] = await db
    .update(orderProducts)
    .set(set)
    .where(eq(orderProducts.id, req.params.id))
    .returning();
  res.json(row);
}

export async function deleteProduct(req: Request, res: Response) {
  await db.delete(orderProducts).where(eq(orderProducts.id, req.params.id));
  res.json({ ok: true });
}

export async function listOrders(req: Request, res: Response) {
  const status = req.query.status as string | undefined;
  const where = status ? eq(orders.status, status) : undefined;
  const rows = await db
    .select()
    .from(orders)
    .where(where as any)
    .orderBy(desc(orders.createdAt))
    .limit(200);
  res.json(rows);
}

export async function updateOrderStatus(req: Request, res: Response) {
  const { status } = req.body;
  const allowed = ["new", "confirmed", "completed", "cancelled"];
  if (!allowed.includes(status)) {
    return res.status(400).json({ error: "invalid status" });
  }
  const [row] = await db
    .update(orders)
    .set({ status })
    .where(eq(orders.id, req.params.id))
    .returning();
  res.json(row);
}
