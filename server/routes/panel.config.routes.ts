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

// import type { Express } from "express";
// import * as analyticsController from "../controllers/analytics.controller";
// import * as dashboardController from "../controllers/dashboard.controller";
// import { extractChannelId } from "../middlewares/channel.middleware";
// import { requireAuth, requirePermission } from "../middlewares/auth.middleware";
// import { PERMISSIONS } from "@shared/schema";


// export function registerAnalyticsRoutes(app: Express) {
//   // Legacy analytics endpoint for backward compatibility
//   app.get("/api/analytics",requireAuth,
//   requirePermission(PERMISSIONS.ANALYTICS_VIEW), dashboardController.getAnalytics);
  
//   // New comprehensive analytics endpoints
//   app.get("/api/analytics/messages", analyticsController.getMessageAnalytics);
//   app.get("/api/analytics/campaigns", analyticsController.getCampaignAnalytics);
//   app.get("/api/analytics/campaigns/:campaignId", analyticsController.getCampaignAnalyticsById);
//   app.get("/api/analytics/export",requireAuth,
//   requirePermission(PERMISSIONS.ANALYTICS_EXPORT), analyticsController.exportAnalytics);
// }


import type { Express } from "express";
import { diployLogger, HTTP_STATUS, DIPLOY_BRAND } from "@diploy/core";
import * as panelController from "../controllers/panel.config.controller";
import { handleDigitalOceanUpload, upload } from "../middlewares/upload.middleware";
import { requireAuth, requireRole } from "../middlewares/auth.middleware";
import { getFirstPanelConfig, updateFirstPanelConfig } from "../services/panel.config";

export function registerPanelConfigRoutes(app: Express) {
  // Web app manifest, built from the panel's own branding so an installed icon
  // carries the reseller's name and logo rather than ours. Served at the site
  // root because that is the scope an installed app runs in.
  // iOS takes its home-screen icon from here rather than the manifest, so point
  // it at the same branded artwork.
  app.get("/apple-touch-icon.png", async (_req, res) => {
    try {
      const config: any = await getFirstPanelConfig();
      const icon = config?.appIcon || config?.favicon || config?.logo;
      if (!icon) return res.status(404).end();
      res.redirect(302, icon);
    } catch {
      res.status(404).end();
    }
  });

  app.get("/manifest.webmanifest", async (_req, res) => {
    try {
      const config: any = await getFirstPanelConfig();
      const name = config?.name || "WhatsApp Panel";
      // A dedicated app icon wins; the favicon is the next best square source,
      // and a panel's logo is usually a wide banner that crops badly.
      const icon = config?.appIcon || config?.favicon || config?.logo;
      const themeColor =
        config?.appearanceConfig?.primaryColor || "#16a34a";

      // Declared once as-is and once as maskable, so Android can crop it into
      // its own icon shape without us claiming sizes the file does not have.
      const icons = icon
        ? ["any", "maskable"].map((purpose) => ({
            src: icon,
            sizes: "512x512",
            type: "image/png",
            purpose,
          }))
        : [];

      res.type("application/manifest+json").json({
        name,
        short_name: name.split(" ")[0] || name,
        description: config?.tagline || config?.description || name,
        start_url: "/login",
        scope: "/",
        display: "standalone",
        orientation: "portrait",
        background_color: "#ffffff",
        theme_color: themeColor,
        icons,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get("/api/platform-settings", async (_req, res) => {
    try {
      const config = await getFirstPanelConfig();
      res.json({
        embeddedSignupEnabled: config?.embeddedSignupEnabled ?? true,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.put("/api/platform-settings", requireAuth, requireRole("superadmin"), async (req, res) => {
    try {
      const { embeddedSignupEnabled } = req.body;
      const config = await updateFirstPanelConfig({
        embeddedSignupEnabled: !!embeddedSignupEnabled,
      });
      res.json({
        embeddedSignupEnabled: config?.embeddedSignupEnabled ?? true,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });
  app.post(
    "/api/panel",
    requireAuth, requireRole("superadmin"),
    upload.fields([{ name: "logo", maxCount: 1 }, { name: "favicon", maxCount: 1 }]),
    handleDigitalOceanUpload,
    panelController.create
  );

  app.get("/api/panel", requireAuth, requireRole("superadmin"), panelController.getAll);
  app.get("/api/panel/:id", requireAuth, requireRole("superadmin"), panelController.getOne);

  app.put(
    "/api/panel/:id",
    requireAuth, requireRole("superadmin"),
    upload.fields([{ name: "logo", maxCount: 1 }, { name: "favicon", maxCount: 1 }]),
    handleDigitalOceanUpload,
    panelController.update
  );

  app.delete("/api/panel/:id", requireAuth, requireRole("superadmin"), panelController.remove);

  app.get("/api/brand-settings", panelController.getBrandSettings);
  app.put("/api/brand-settings", requireAuth, requireRole("superadmin"), upload.fields([{ name: "logo", maxCount: 1 },{name: "logo2", maxCount:1}, { name: "favicon", maxCount: 1 }]),handleDigitalOceanUpload, panelController.updateBrandSettings);
  app.post("/api/brand-settings", requireAuth, requireRole("superadmin"), upload.fields([{ name: "logo", maxCount: 1 }, {name: "logo2", maxCount:1}, { name: "favicon", maxCount: 1 }]),handleDigitalOceanUpload, panelController.createBrandSettings);
}