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

import { Request, Response, NextFunction } from "express";
import { diployLogger, HTTP_STATUS, DIPLOY_BRAND } from "@diploy/core";
import { Permission } from "@shared/schema";
import { storage } from '../storage';

// Extend Express Request type to include session
declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        username: string;
        email: string;
        firstName: string;
        lastName?: string;
        role: string;
        permissions: Permission[];
        avatar?: string;
      };
    }
  }
}

// Authentication middleware
/**
 * Resolve a native mobile client's `Authorization: Bearer <jwt>` header.
 *
 * Runs before the CSRF middleware and sets `req.tokenUser` only once the token
 * actually verifies. CSRF exists to stop a browser being tricked into sending
 * its ambient session cookie; a Bearer token is never attached automatically,
 * so token-authenticated requests are exempt. Verifying first matters: if the
 * mere presence of the header were enough to skip CSRF, an attacker could
 * bypass the check by sending a junk header and riding the session cookie.
 *
 * Never rejects on its own - an unusable token simply leaves the request
 * unauthenticated, and `requireAuth` produces the 401.
 */
export const resolveBearerAuth = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const header = req.headers.authorization;
  if (!header || !header.startsWith("Bearer ")) return next();

  try {
    const { authenticateAccessToken } = await import("../services/mobile-auth");
    const user = await authenticateAccessToken(header.slice(7).trim());
    if (user) (req as any).tokenUser = user;
  } catch {
    // A malformed token is not an error worth failing the request over.
  }
  next();
};

/** True when this request authenticated with a verified Bearer token. */
export function isTokenAuthenticated(req: Request): boolean {
  return !!(req as any).tokenUser;
}

export const requireAuth = (req: Request, res: Response, next: NextFunction) => {
  // A verified mobile token stands in for a session, and carries the same
  // user shape so every downstream permission and tenant-scoping check is
  // unchanged.
  const user = (req as any).session?.user || (req as any).tokenUser;

  if (!user) {
    return res.status(401).json({ error: "Authentication required" });
  }

  req.user = user;
  next();
};

// Role-based authorization middleware
export const requireRole = (...roles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    if (!roles.includes(user.role)) {
      return res.status(403).json({ error: "Insufficient permissions" });
    }

    next();
  };
};

// Narrow superadmin gate for operations that must never be reachable by any
// tenant-level role (e.g. cross-tenant configuration, global webhook configs).
export const requireSuperadmin = requireRole("superadmin");

// Implicit permissions granted by role. Evaluated explicitly inside
// `requirePermission` so the middleware always runs an actual permission
// resolution step (no blanket "skip check" bypass by role) while
// preserving the existing role-based authorization model. Superadmin is
// resolved against ALL_IMPLICIT_PERMISSIONS; tenant-admin against the
// narrower tenant-admin set. A dedicated `requireSuperadmin` helper
// remains available for routes that must be reachable by superadmin only.
const ADMIN_IMPLICIT_PERMISSIONS: ReadonlySet<string> = new Set([
  "contacts:view", "contacts:create", "contacts:edit", "contacts:delete", "contacts:export",
  "campaigns:view", "campaigns:create", "campaigns:edit", "campaigns:delete", "campaigns:send",
  "templates:view", "templates:create", "templates:edit", "templates:delete", "templates:sync",
  "inbox:view", "inbox:assign",
  "analytics:view", "analytics:export",
  "team:view", "team:create", "team:edit", "team:delete", "team:permissions",
  "settings:view", "settings:edit",
  "automations:view", "automations:create", "automations:edit", "automations:delete",
  "logs:view",
  "messages.send", "messages.read", "contacts.read", "contacts.write",
]);

// Permission-based authorization middleware
// export const requirePermission = (...permissions: Permission[]) => {
//   return (req: Request, res: Response, next: NextFunction) => {
//     const user = req.user;

//     if (!user) {
//       return res.status(401).json({ error: "Authentication required" });
//     }

//     // Admins have all permissions
//     if (user.role === "admin") {
//       return next();
//     }

//     const hasPermission = permissions.some(permission => 
//       user.permissions.includes(permission)
//     );

//     if (!hasPermission) {
//       return res.status(403).json({ error: "Insufficient permissions" });
//     }

//     next();
//   };
// };

export const requirePermission = (...permissions: string[]) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ error: "Authentication required" });
    }

    try {
      // Resolve effective permissions for this user. No role-based bypass:
      // every role — including superadmin — must resolve at least one of
      // the requested permissions against its stored ACL before the
      // request is allowed to proceed. Superadmin-only routes opt in via
      // the dedicated `requireSuperadmin` helper; this middleware does
      // NOT grant superadmin an implicit pass.
      //
      // - admin: union of stored DB permissions with the documented
      //   tenant-admin implicit set (covers legacy rows without a full
      //   ACL).
      // - superadmin / team / agent: strictly the stored DB set.
      const stored = (await storage.getPermissions(user.id)) ?? [];
      const effective = new Set<string>(stored);

      if (user.role === "admin") {
        for (const p of ADMIN_IMPLICIT_PERMISSIONS) effective.add(p);
      }

      const hasPermission = permissions.some((perm) => effective.has(perm));
      if (!hasPermission) {
        return res.status(403).json({ error: "Insufficient permissions" });
      }

      next();
    } catch (error) {
      console.error("Error checking permissions:", error);
      res.status(500).json({ error: "Internal server error" });
    }
  };
};






// Optional auth middleware (doesn't require auth but adds user if available)
export const optionalAuth = (req: Request, res: Response, next: NextFunction) => {
  const user = (req as any).session?.user;
  if (user) {
    req.user = user;
  }
  next();
};