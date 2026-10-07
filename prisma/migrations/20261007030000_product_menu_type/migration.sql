ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS "menuType" TEXT NOT NULL DEFAULT 'MAIN';

UPDATE "Product" p
SET "menuType" = CASE
  WHEN LOWER(c."nameVi") LIKE '%nước%' OR LOWER(c."nameVi") LIKE '%nuoc%' OR LOWER(c."nameVi") LIKE '%uống%' OR LOWER(c."nameVi") LIKE '%drink%' THEN 'DRINK'
  WHEN LOWER(c."nameVi") LIKE '%thêm%' OR LOWER(c."nameVi") LIKE '%them%' OR LOWER(c."nameVi") LIKE '%extra%' THEN 'EXTRA'
  ELSE 'MAIN'
END
FROM "Category" c
WHERE p."categoryId" = c."id";

CREATE INDEX IF NOT EXISTS "Product_restaurantId_menuType_idx" ON "Product"("restaurantId", "menuType");
