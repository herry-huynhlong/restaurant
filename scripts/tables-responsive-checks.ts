import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const panel = readFileSync("src/components/admin/tables-live-panel.tsx", "utf8");
const qrCard = readFileSync("src/components/admin/qr-card.tsx", "utf8");

assert.match(panel, /function TableDetailOverlay/);
assert.match(panel, /fixed inset-0 z-50/);
assert.match(panel, /h-\[100dvh\]/);
assert.match(panel, /md:w-\[min\(480px,calc\(100vw-48px\)\)\]/);
assert.match(panel, /overflow-x-hidden overflow-y-auto/);
assert.match(panel, /window\.history\.pushState/);
assert.match(panel, /window\.addEventListener\("popstate"/);
assert.match(panel, /window\.scrollTo\(\{ top: tableScrollPosition\.current/);
assert.match(panel, /onClick=\{onSelect\}/);
assert.match(panel, /aria-label=\{`Xem chi tiết Bàn/);
assert.match(panel, /min-h-11 w-full/);
assert.doesNotMatch(panel, /xl:grid-cols-\[1fr_420px\]/);
assert.match(qrCard, /min-h-11/);

console.log("Responsive table detail checks passed for mobile, tablet and desktop breakpoints.");
