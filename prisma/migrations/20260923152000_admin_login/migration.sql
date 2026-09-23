-- The browser login form needs something to type. `name` is a display name and
-- is not one: two administrators may share a name, and renaming someone must
-- not change how they sign in.
--
-- Backfilled rather than added NOT NULL outright. The table is empty here, but
-- a migration that only works on an empty table is a migration that fails the
-- first time it matters.
ALTER TABLE "admin_users" ADD COLUMN "login" TEXT;

UPDATE "admin_users" SET "login" = 'admin-' || left("id", 8) WHERE "login" IS NULL;

ALTER TABLE "admin_users" ALTER COLUMN "login" SET NOT NULL;

CREATE UNIQUE INDEX "admin_users_login_key" ON "admin_users"("login");
