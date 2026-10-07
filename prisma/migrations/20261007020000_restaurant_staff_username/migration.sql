ALTER TABLE "RestaurantUser"
  ADD COLUMN IF NOT EXISTS "username" TEXT;

WITH base_names AS (
  SELECT
    ru."id",
    LOWER(REGEXP_REPLACE(SPLIT_PART(u."email", '@', 1), '[^a-zA-Z0-9_-]', '', 'g')) AS base_username
  FROM "RestaurantUser" ru
  JOIN "User" u ON ru."userId" = u."id"
  WHERE ru."username" IS NULL
),
ranked AS (
  SELECT
    ru."id",
    COALESCE(NULLIF(base_names.base_username, ''), 'user') AS base_username,
    ROW_NUMBER() OVER (
      PARTITION BY ru."restaurantId", COALESCE(NULLIF(base_names.base_username, ''), 'user')
      ORDER BY ru."createdAt", ru."id"
    ) AS duplicate_rank
  FROM "RestaurantUser" ru
  JOIN base_names ON base_names."id" = ru."id"
)
UPDATE "RestaurantUser" ru
SET "username" = CASE
  WHEN ranked.duplicate_rank = 1 THEN ranked.base_username
  ELSE ranked.base_username || '-' || LEFT(ru."id", 6)
END
FROM ranked
WHERE ru."id" = ranked."id";

UPDATE "RestaurantUser"
SET "username" = 'user-' || LEFT("id", 8)
WHERE "username" IS NULL OR "username" = '';

CREATE UNIQUE INDEX IF NOT EXISTS "RestaurantUser_restaurantId_username_key"
  ON "RestaurantUser"("restaurantId", "username");

