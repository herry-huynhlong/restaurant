import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";

const root = process.cwd();

function read(relativePath: string) {
  return readFileSync(path.join(root, relativePath), "utf8");
}

function includes(file: string, value: string, message: string) {
  assert.ok(read(file).includes(value), message);
}

function excludes(file: string, value: string, message: string) {
  assert.ok(!read(file).includes(value), message);
}

const detailService = "src/server/services/payment-detail-service.ts";
const detailRoute = "src/app/api/restaurants/[rSlug]/reports/payments/[paymentId]/route.ts";
const historyRoute = "src/app/api/restaurants/[rSlug]/reports/payments/route.ts";
const tablePanel = "src/components/admin/tables-live-panel.tsx";
const paymentTable = "src/components/admin/payment-report-table.tsx";
const reportPage = "src/app/[rSlug]/admin/reports/page.tsx";
const cashierPage = "src/app/[rSlug]/cashier/page.tsx";
const printButton = "src/components/billing/invoice-print-button.tsx";

includes(detailService, "restaurantId,", "Paid bill lookup must stay scoped to the current restaurant.");
includes(detailService, 'status: "PAID"', "Paid bill lookup must reject unpaid payments.");
includes(detailService, "paidAt: { not: null }", "Paid bill lookup must require a completed payment time.");
includes(detailRoute, '["OWNER", "MANAGER", "CASHIER"]', "Only permitted restaurant roles may read a paid bill.");
includes(detailRoute, '"BILL_PRINT"', "Paid bill API must enforce the plan bill-print feature.");
includes(tablePanel, 'label="In phiếu tạm tính"', "The active table must keep its clearly labelled unpaid bill.");
includes(tablePanel, "PaidBillButton", "The table page must expose a paid bill separately from the preliminary receipt.");
includes(tablePanel, "Xác nhận thanh toán và in bill", "Payment-and-print must require an explicit confirmation dialog.");
includes(tablePanel, "Xác nhận thanh toán & In bill", "Payment-and-print must expose a single guarded confirmation command.");
includes(tablePanel, "/ops/pay-session", "Payment-and-print must reuse the existing payment endpoint.");
includes(tablePanel, "expectedGrandTotal", "Payment-and-print must verify the amount displayed before charging.");
includes(tablePanel, "BillDetailModal", "A successful payment must open the official paid bill interface.");
includes("src/server/services/payment-service.ts", "FOR UPDATE", "Concurrent payment confirmation must lock the active dining session.");
includes("src/server/services/payment-service.ts", "payment-request-${diningSessionId}", "Payment confirmation must remain idempotent per dining session.");
includes("src/server/services/payment-service.ts", 'status: "AVAILABLE"', "Successful payment must release the table.");
includes("src/server/services/payment-service.ts", 'reason: "BILL_CHANGED"', "Changed bills must be rejected before payment is recorded.");
includes(tablePanel, 'label="In bill gần nhất"', "An empty table must expose its latest real paid bill.");
includes(tablePanel, "BillHistoryButton", "The table page must expose the compact bill history entry point.");
excludes(tablePanel, "Bill thanh toán gần đây", "Paid bill history must not stay expanded on the table page.");
includes(detailService, "DISTINCT ON", "Latest paid bills must be selected once per table.");
includes(detailService, 'orderBy: [{ paidAt: "desc" }, { id: "desc" }]', "Paid bill history must have stable newest-first ordering.");
includes(historyRoute, 'pageSize: 20', "Paid bill history must be paginated instead of loading every payment.");
includes(historyRoute, '["OWNER", "MANAGER", "CASHIER"]', "Only permitted restaurant roles may list paid bills.");
includes(historyRoute, '"BILL_PRINT"', "Paid bill history must enforce the bill-print feature.");
includes(detailService, 'dayHeading: dateKey === todayKey ? `Hôm nay', "Paid bill history must group recent bills by local day.");
includes(paymentTable, 'aria-label="Đóng lịch sử bill"', "Paid bill history must provide an accessible close control.");
includes(reportPage, "PaymentReportTable", "Payment history must keep the paid bill detail and reprint flow.");
includes(cashierPage, "getRecentPaidPaymentSummaries", "Cashiers must be able to find recently paid bills.");
includes(printButton, 'paperSize?: "58mm" | "80mm"', "Thermal printing must support 58 mm and 80 mm paper.");
includes("src/server/services/billing-service.ts", "unitPriceSnapshot", "Payment must be based on order item price snapshots.");
includes("src/server/services/payment-service.ts", "invoiceBusinessName", "Payment must preserve invoice identity snapshots.");

console.log("Paid bill flow checks passed.");
