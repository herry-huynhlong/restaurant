import { PrismaClient } from "@prisma/client";
import { auditFinancialSource } from "../src/server/services/financial-audit-service";

async function main() {
  const url = process.env.FINANCIAL_AUDIT_DATABASE_URL;
  if (!url) throw new Error("Set FINANCIAL_AUDIT_DATABASE_URL explicitly; no DATABASE_URL fallback.");
  const target = new URL(url);
  const isolated = ["127.0.0.1", "localhost", "::1"].includes(target.hostname) && /(^|[_-])test([_-]|$)/i.test(target.pathname.slice(1));
  if (!isolated && !process.argv.includes("--allow-non-test-read")) {
    throw new Error("Non-test audit requires separate owner approval, then explicit --allow-non-test-read. No production query performed.");
  }
  const client = new PrismaClient({ datasourceUrl: url });
  try {
    const report = await auditFinancialSource(client);
    console.log(JSON.stringify({ generatedAt: new Date().toISOString(), ...report }, null, 2));
    if (report.findings.some((finding) => finding.count > 0)) process.exitCode = 2;
  } finally { await client.$disconnect(); }
}
main().catch(() => { console.error("Financial audit failed. Check access, database target and PostgreSQL logs; no repair was attempted."); process.exitCode = 1; });
