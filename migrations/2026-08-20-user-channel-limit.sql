BEGIN;

-- How many WhatsApp channels an account may connect. Superadmin sets it from
-- Users → channel-count badge.
ALTER TABLE users ADD COLUMN IF NOT EXISTS channel_limit integer DEFAULT 1;

-- Nobody should end up over their limit on day one: existing accounts keep at
-- least what they already have connected.
UPDATE users u
   SET channel_limit = GREATEST(
     COALESCE(u.channel_limit, 1),
     (SELECT COUNT(*) FROM channels c WHERE c.created_by = u.id),
     1
   );

COMMIT;

SELECT username, channel_limit,
       (SELECT COUNT(*) FROM channels c WHERE c.created_by = users.id) AS channels
  FROM users ORDER BY channel_limit DESC;
