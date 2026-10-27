import { Prisma, type PrismaClient } from "@prisma/client";

// Identifiers only: never export customer names, notes, bank details or credentials.
const checks: Array<{ code: string; sql: Prisma.Sql }> = [
  { code: "PAID_WITHOUT_PAID_AT", sql: Prisma.sql`SELECT id FROM "Payment" WHERE status='PAID' AND "paidAt" IS NULL` },
  { code: "BILL_TOTAL_MISMATCH", sql: Prisma.sql`SELECT id FROM "Payment" WHERE status='PAID' AND ("subtotalAmount"::bigint + "taxAmount"::bigint <> "grandTotal"::bigint OR amount <> "grandTotal")` },
  { code: "MISSING_BILL_SNAPSHOT", sql: Prisma.sql`SELECT id FROM "Payment" WHERE status='PAID' AND (NULLIF(btrim("invoiceNumber"),'') IS NULL OR NULLIF(btrim("tableIdSnapshot"),'') IS NULL OR NULLIF(btrim("tableNameSnapshot"),'') IS NULL OR NULLIF(btrim("invoiceBusinessName"),'') IS NULL OR NULLIF(btrim("invoiceDisplayName"),'') IS NULL)` },
  { code: "MULTIPLE_PAID_PER_SESSION", sql: Prisma.sql`SELECT "diningSessionId" AS id FROM "Payment" WHERE status='PAID' GROUP BY "diningSessionId" HAVING count(*) > 1` },
  { code: "PAYMENT_TENANT_MISMATCH", sql: Prisma.sql`SELECT p.id FROM "Payment" p JOIN "DiningSession" s ON s.id=p."diningSessionId" JOIN "RestaurantTable" t ON t.id=s."tableId" WHERE p."restaurantId"<>s."restaurantId" OR t."restaurantId"<>s."restaurantId"` },
  { code: "ORDER_TENANT_MISMATCH", sql: Prisma.sql`SELECT o.id FROM "Order" o JOIN "DiningSession" s ON s.id=o."diningSessionId" JOIN "RestaurantTable" t ON t.id=o."tableId" WHERE o."restaurantId"<>s."restaurantId" OR t."restaurantId"<>o."restaurantId" OR o."tableId"<>s."tableId"` },
  { code: "ITEM_TENANT_MISMATCH", sql: Prisma.sql`SELECT i.id FROM "OrderItem" i JOIN "Order" o ON o.id=i."orderId" JOIN "Product" p ON p.id=i."productId" WHERE i."restaurantId"<>o."restaurantId" OR p."restaurantId"<>i."restaurantId"` },
  { code: "DUPLICATE_INVOICE_NUMBER", sql: Prisma.sql`SELECT min(id) AS id FROM "Payment" WHERE "invoiceNumber" IS NOT NULL GROUP BY "invoiceNumber" HAVING count(*)>1` },
  { code: "DUPLICATE_IDEMPOTENCY_KEY", sql: Prisma.sql`SELECT min(id) AS id FROM "Payment" WHERE "idempotencyKey" IS NOT NULL GROUP BY "restaurantId", "idempotencyKey" HAVING count(*)>1` },
  { code: "LEGACY_INCOMPLETE", sql: Prisma.sql`SELECT p.id FROM "Payment" p WHERE p.status='PAID' AND (p."confirmedByUserId" IS NULL OR NULLIF(btrim(p."idempotencyKey"),'') IS NULL OR NOT EXISTS (SELECT 1 FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id WHERE o."diningSessionId"=p."diningSessionId") OR EXISTS (SELECT 1 FROM "Order" o JOIN "OrderItem" i ON i."orderId"=o.id WHERE o."diningSessionId"=p."diningSessionId" AND (NULLIF(btrim(i."productNameViSnapshot"),'') IS NULL OR i.quantity<=0 OR i."unitPriceSnapshot"<0 OR i.subtotal::bigint<>i."unitPriceSnapshot"::bigint*i.quantity+i."optionTotalSnapshot"::bigint*i.quantity)))` },
  { code: "PAID_SOURCE_TOTAL_MISMATCH", sql: Prisma.sql`SELECT p.id FROM "Payment" p LEFT JOIN "Order" o ON o."diningSessionId"=p."diningSessionId" LEFT JOIN "OrderItem" i ON i."orderId"=o.id WHERE p.status='PAID' GROUP BY p.id HAVING p."subtotalAmount"::bigint <> COALESCE(sum(i.subtotal::bigint),0)` },
  { code: "PAID_SESSION_STATE_MISMATCH", sql: Prisma.sql`SELECT p.id FROM "Payment" p JOIN "DiningSession" s ON s.id=p."diningSessionId" WHERE p.status='PAID' AND (s.status<>'CLOSED' OR s."paymentStatus"<>'PAID' OR s."closedAt" IS NULL)` }
];

export async function auditFinancialSource(client: PrismaClient) {
  return client.$transaction(async (tx) => {
    // PostgreSQL enforces read-only for every query, in one consistent snapshot.
    await tx.$executeRaw`SET TRANSACTION READ ONLY`;
    const findings = [];
    for (const check of checks) {
      const [result] = await tx.$queryRaw<Array<{ count: bigint; sampleIds: string[] | null }>>(Prisma.sql`
        WITH findings AS (${check.sql})
        SELECT (SELECT count(*) FROM findings) AS count,
          ARRAY(SELECT id FROM findings ORDER BY id LIMIT 20) AS "sampleIds"
      `);
      findings.push({ code: check.code, count: Number(result.count), sampleIds: result.sampleIds ?? [] });
    }
    return { readOnly: true, isolation: "RepeatableRead", findings };
  }, { isolationLevel: "RepeatableRead", timeout: 60000 });
}
