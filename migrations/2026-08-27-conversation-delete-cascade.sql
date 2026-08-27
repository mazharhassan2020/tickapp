BEGIN;

-- Deleting a chat was blocked by automation_executions (NO ACTION), while every
-- other child table already cascades. An execution has no meaning without its
-- conversation, so it goes with it.
ALTER TABLE automation_executions
  DROP CONSTRAINT IF EXISTS automation_executions_conversation_id_conversations_id_fk;
ALTER TABLE automation_executions
  ADD CONSTRAINT automation_executions_conversation_id_conversations_id_fk
  FOREIGN KEY (conversation_id) REFERENCES conversations(id) ON DELETE CASCADE;

COMMIT;

SELECT conrelid::regclass AS tbl, conname, confdeltype
  FROM pg_constraint WHERE confrelid = 'conversations'::regclass ORDER BY 1;
