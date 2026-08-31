-- Send a welcome email to a team member when their account is created.
-- On by default: the member needs to be told where to log in.
ALTER TABLE app_features
  ADD COLUMN IF NOT EXISTS team_welcome_email boolean NOT NULL DEFAULT true;
