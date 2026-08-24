BEGIN;

-- Deleting a plan must not be blocked by historical records.
-- subscriptions.plan_data / transactions keep their own snapshot of the plan,
-- so detaching (SET NULL) preserves history while allowing the delete.

ALTER TABLE subscriptions ALTER COLUMN plan_id DROP NOT NULL;

ALTER TABLE subscriptions DROP CONSTRAINT IF EXISTS subscriptions_plan_id_plans_id_fk;
ALTER TABLE subscriptions
  ADD CONSTRAINT subscriptions_plan_id_plans_id_fk
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;

ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_plan_id_plans_id_fk;
ALTER TABLE transactions
  ADD CONSTRAINT transactions_plan_id_plans_id_fk
  FOREIGN KEY (plan_id) REFERENCES plans(id) ON DELETE SET NULL;

COMMIT;

SELECT conname, conrelid::regclass AS tbl, confdeltype
  FROM pg_constraint
 WHERE confrelid = 'plans'::regclass;
