-- Browser push subscriptions (Web Push / VAPID). One row per device, since a
-- person can have the app installed on several.
CREATE TABLE IF NOT EXISTS push_subscriptions (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     varchar NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL UNIQUE,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  user_agent  text,
  created_at  timestamptz DEFAULT now(),
  last_used_at timestamptz
);

CREATE INDEX IF NOT EXISTS push_subscriptions_user_idx ON push_subscriptions (user_id);

-- The server's VAPID identity. Generated once on first use; the public half is
-- handed to browsers, the private half signs each push.
CREATE TABLE IF NOT EXISTS push_config (
  id          varchar PRIMARY KEY DEFAULT gen_random_uuid(),
  public_key  text NOT NULL,
  private_key text NOT NULL,
  subject     text NOT NULL DEFAULT 'mailto:support@example.com',
  created_at  timestamptz DEFAULT now()
);
