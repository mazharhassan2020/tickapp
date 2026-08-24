BEGIN;

-- Master switch for prepaid wallet billing. When false, balances are neither
-- checked nor charged (plans/trials govern sending instead).
ALTER TABLE billing_settings
  ADD COLUMN IF NOT EXISTS wallet_billing_enabled boolean NOT NULL DEFAULT true;

COMMIT;

SELECT currency, default_rate, markup, wallet_billing_enabled FROM billing_settings;
