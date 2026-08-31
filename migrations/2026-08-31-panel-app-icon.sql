-- Home-screen icon for the installed app. Kept separate from the favicon so a
-- panel can use square artwork for the app without changing its browser tab.
ALTER TABLE panel_config ADD COLUMN IF NOT EXISTS app_icon varchar;
