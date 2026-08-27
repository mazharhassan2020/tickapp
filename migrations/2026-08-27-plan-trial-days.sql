-- Free trial (in days) offered on a plan. Passed to Stripe Checkout as
-- subscription_data.trial_period_days: the card is collected up front and the
-- first charge happens when the trial ends.
ALTER TABLE plans ADD COLUMN IF NOT EXISTS trial_days integer DEFAULT 0;
