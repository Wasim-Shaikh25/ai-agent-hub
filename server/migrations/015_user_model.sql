-- Per-user model choice. This product is user-oriented: each developer picks
-- their own model, self-serve. The admin org default (a `model` policy) is only
-- a fallback for users who haven't chosen. Applied Hub-side when the agent
-- doesn't pin its own model.
CREATE TABLE IF NOT EXISTS user_model_pref (
  org_id     uuid NOT NULL REFERENCES org(id) ON DELETE CASCADE,
  user_id    uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  model      text NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, user_id)
);
