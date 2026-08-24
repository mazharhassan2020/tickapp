BEGIN;

ALTER TABLE plans
  ADD COLUMN IF NOT EXISTS quarterly_price numeric(10,2) DEFAULT '0',
  ADD COLUMN IF NOT EXISTS stripe_price_id_quarterly varchar,
  ADD COLUMN IF NOT EXISTS razorpay_plan_id_quarterly varchar,
  ADD COLUMN IF NOT EXISTS paypal_plan_id_quarterly varchar,
  ADD COLUMN IF NOT EXISTS paystack_plan_code_quarterly varchar,
  ADD COLUMN IF NOT EXISTS mercadopago_plan_id_quarterly varchar;

-- The old "monthly_price" column actually held the QUARTERLY amount
-- (the UI labelled it "Quarterly Price"). Move it to quarterly_price and
-- seed monthly_price with a per-month figure the admin can adjust.
UPDATE plans
   SET quarterly_price = monthly_price
 WHERE (quarterly_price IS NULL OR quarterly_price = 0)
   AND monthly_price > 0;

UPDATE plans
   SET monthly_price = round(quarterly_price / 3, 2)
 WHERE quarterly_price > 0
   AND monthly_price = quarterly_price;

COMMIT;

SELECT name, monthly_price, quarterly_price, annual_price FROM plans ORDER BY quarterly_price;
