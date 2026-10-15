import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.cwd();
const sourceRoot = join(root, "src");

function filesUnder(directory: string): string[] {
  return readdirSync(directory).flatMap((entry) => {
    const path = join(directory, entry);
    return statSync(path).isDirectory() ? filesUnder(path) : path.endsWith(".tsx") ? [path] : [];
  });
}

function source(path: string) {
  return readFileSync(join(root, path), "utf8");
}

function assertIncludes(path: string, snippets: string[]) {
  const content = source(path);
  for (const snippet of snippets) {
    if (!content.includes(snippet)) {
      throw new Error(`${path} thiếu cơ chế UX bắt buộc: ${snippet}`);
    }
  }
}

const files = filesUnder(sourceRoot);
const dialogCount = files.reduce((count, path) => {
  const content = readFileSync(path, "utf8");
  return count + (content.match(/<dialog\b|role=["']dialog["']/g)?.length ?? 0);
}, 0);
const formCount = files.reduce((count, path) => {
  const content = readFileSync(path, "utf8");
  return count + (content.match(/<form\b/g)?.length ?? 0);
}, 0);

assertIncludes("src/components/ui/pending-submit-button.tsx", ["useFormStatus", "disabled={disabled || pending}", "pendingLabel"]);
assertIncludes("src/components/admin/feedback-banner.tsx", ["setTimeout", "router.replace", "role={safeError ? \"alert\" : \"status\"}"]);
assertIncludes("src/components/admin/subscription-pricing-client.tsx", ["dialogRef.current?.close()", "PendingSubmitButton", "setSelectedPrice(null)"]);
assertIncludes("src/components/platform/owners-manager.tsx", ["editDialogRef.current?.close()", "resetDialogRef.current?.close()", "setPassword(\"\")", "PendingSubmitButton"]);
assertIncludes("src/components/platform/restaurant-row-actions.tsx", ["permanentDeleteDialogRef.current?.close()", "setConfirmPassword(\"\")", "PendingSubmitButton"]);
assertIncludes("src/components/platform/backup-history-card.tsx", ["state.status !== \"success\"", "onAccepted(state.restoreJobId, state.message)", "FormCancelButton"]);
assertIncludes("src/components/platform/restaurant-backup-table.tsx", ["state.status !== \"success\"", "onAccepted(state.message)", "FormCancelButton"]);
assertIncludes("src/components/admin/qr-card.tsx", ["setConfirmOpen(false)", "disabled={pending}"]);
assertIncludes("src/components/admin/tables-live-panel.tsx", ["setIsSubmitting(true)", "disabled={isSubmitting}", "setOrderingTableId(null)"]);

const unmanagedSubmitFiles = files
  .filter((path) => {
    const content = readFileSync(path, "utf8");
    return content.includes('type="submit"')
      && !content.includes("PendingSubmitButton")
      && !content.includes("ConfirmSubmitButton")
      && !content.includes("useFormStatus")
      && !content.includes("isPending")
      && !content.includes("isSubmitting")
      && !content.includes("disabled={pending}");
  })
  .map((path) => relative(root, path));

if (unmanagedSubmitFiles.length > 0) {
  throw new Error(`Form submit chưa có trạng thái chống gửi trùng:\n${unmanagedSubmitFiles.join("\n")}`);
}

console.log(`Form UX checks passed: ${files.length} TSX files scanned, ${dialogCount} dialog surfaces and ${formCount} forms inventoried.`);
