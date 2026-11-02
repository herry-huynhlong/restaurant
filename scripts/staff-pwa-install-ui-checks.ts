import assert from "node:assert/strict";
import fs from "node:fs";
import vm from "node:vm";
import { createRequire } from "node:module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Render the actual install components under explicit capability states.
// This is a React UI test, not a native PWA installation test.
const requireModule = createRequire(import.meta.url);
let state = { ready: false, standalone: false };
const source = fs.readFileSync("src/components/app-shell/install-app-button.tsx", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
} }).outputText;
const moduleObject = { exports: {} as Record<string, React.ComponentType> };
vm.runInNewContext(compiled, {
  module: moduleObject, exports: moduleObject.exports,
  require: (name: string) => name === "./pwa-install-provider"
    ? { usePwaInstall: () => ({ ...state, requestInstall: async () => "unavailable" }) }
    : name === "@/lib/install-help" ? { installHelp: () => ({ title: "Hướng dẫn", steps: [] }) }
    : requireModule(name)
});
const { StaffPwaInstallOptions, InstallAppButton } = moduleObject.exports;
for (const standalone of [false, true]) {
  state = { ready: false, standalone };
  assert.equal(renderToStaticMarkup(React.createElement(StaffPwaInstallOptions)), "");
  assert.equal(renderToStaticMarkup(React.createElement(InstallAppButton)), "");
}
state = { ready: true, standalone: true };
assert.equal(renderToStaticMarkup(React.createElement(StaffPwaInstallOptions)), "");
assert.equal(renderToStaticMarkup(React.createElement(InstallAppButton)), "");
state = { ready: true, standalone: false };
const html = renderToStaticMarkup(React.createElement(StaffPwaInstallOptions));
assert.match(html, /Cài App/);
assert.match(html, /Truy cập nhanh từ màn hình chính/);
assert.doesNotMatch(html, /PWA dual-flow QA|thử nghiệm|<ol/);
console.log("PASS install UI: no SSR/detection flash, no standalone CTA/help, compact browser option, no QA copy");
