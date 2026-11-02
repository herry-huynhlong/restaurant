import assert from "node:assert/strict";
import { staffPwaContext, staffPwaStartUrl } from "../src/lib/tenant-pwa";
import { buildTenantPwaManifest, buildTenantPwaMetadata } from "../src/server/services/tenant-pwa-service";

const branding = { slug: "qa-store", name: "QA store", themeColor: "#0f766e", version: "test" };
const roles = { MANAGER: "admin", WAITER: "staff", KITCHEN: "kitchen", CASHIER: "cashier" } as const;
for (const [role, context] of Object.entries(roles)) {
  assert.equal(staffPwaContext(role), context);
  const manifest = buildTenantPwaManifest(branding, context);
  const start = new URL(manifest.start_url, "https://qa.invalid");
  assert.equal(start.pathname, "/qa-store/login");
  assert.equal(start.searchParams.get("role"), role);
  assert.equal(start.searchParams.get("pwa"), "1");
  assert.equal(manifest.id, `/qa-store/pwa/${context}`);
  assert.equal(manifest.scope, "/qa-store/");
  assert.equal(buildTenantPwaMetadata(branding, context).manifest, `/qa-store/${context}/manifest.webmanifest`);
  assert.deepEqual([...start.searchParams.keys()].sort(), ["pwa", "role"]);
}
assert.equal(staffPwaContext("OWNER"), "admin");
assert.equal(staffPwaContext("PLATFORM_ADMIN"), "employee");
assert.equal(staffPwaContext("WAITER&role=OWNER"), "employee");
assert.equal(staffPwaStartUrl("qa-store", "employee"), "/qa-store/login?pwa=1");
assert.equal(staffPwaStartUrl("qa-store", "customer"), "/qa-store/welcome");
assert.notEqual(buildTenantPwaManifest(branding, "employee").id, buildTenantPwaManifest(branding, "customer").id);
console.log("PASS staff PWA: four departments, stable IDs, tenant scope, customer unchanged, no credential in manifest.");
