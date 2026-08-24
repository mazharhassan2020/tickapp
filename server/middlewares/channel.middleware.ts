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

import type { Request, Response, NextFunction } from 'express';
import { diployLogger, HTTP_STATUS, DIPLOY_BRAND } from "@diploy/core";
import { storage } from '../storage';
import { AppError } from './error.middleware';

export interface RequestWithChannel extends Request {
  activeChannel?: any;
  channelId?: string;
}

/** The signed-in user's owner id — a team member works on their admin's channels. */
function ownerIdOfRequest(req: Request): string | null {
  const user = (req as any).session?.user || (req as any).user;
  if (!user) return null;
  return user.role === 'team' ? (user.createdBy || user.id) : user.id;
}

/**
 * The caller's own active channel. Never fall back to `storage.getActiveChannel()`
 * here: that returns the newest active channel in the WHOLE database, which for a
 * brand-new account silently points at another tenant's channel.
 */
async function activeChannelForRequest(req: Request) {
  const ownerId = ownerIdOfRequest(req);
  if (!ownerId) return undefined;
  const user = (req as any).session?.user || (req as any).user;
  if (user?.role === 'superadmin') {
    return (await storage.getActiveChannelByUserId(ownerId)) || (await storage.getActiveChannel());
  }
  return await storage.getActiveChannelByUserId(ownerId);
}

export async function requireActiveChannel(
  req: RequestWithChannel,
  res: Response,
  next: NextFunction
) {
  try {
    const activeChannel = await activeChannelForRequest(req);
    if (!activeChannel) {
      throw new AppError(400, 'No active channel found. Please configure a channel first.');
    }
    req.activeChannel = activeChannel;
    req.channelId = activeChannel.id;
    next();
  } catch (error) {
    next(error);
  }
}

export async function extractChannelId(
  req: RequestWithChannel,
  res: Response,
  next: NextFunction
) {
  try {
    // Check query parameter first
    let channelId = req.query.channelId as string | undefined;
    
    // If not in query, fall back to the caller's OWN active channel
    if (!channelId) {
      const activeChannel = await activeChannelForRequest(req);
      if (activeChannel) {
        channelId = activeChannel.id;
      }
    }
    
    req.channelId = channelId;
    next();
  } catch (error) {
    next(error);
  }
}