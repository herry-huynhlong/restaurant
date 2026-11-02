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
let helpOpen = false;
const help = { title: "Cài ứng dụng trên iPhone / iPad", steps: ["Mở Chia sẻ → Thêm vào Màn hình chính."] };
const source = fs.readFileSync("src/components/app-shell/install-app-button.tsx", "utf8");
const compiled = ts.transpileModule(source, { compilerOptions: {
  module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true
} }).outputText;
const moduleObject = { exports: {} as Record<string, React.ComponentType> };
vm.runInNewContext(compiled, {
  module: moduleObject, exports: moduleObject.exports,
  require: (name: string) => name === "./pwa-install-provider"
    ? { usePwaInstall: () => ({ ...state, requestInstall: async () => "unavailable" }) }
    : name === "react" ? { ...React, useState: <T,>(initial: T) => initial === null && helpOpen ? [help, () => {}] : React.useState(initial) }
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
helpOpen = true;
const opened = renderToStaticMarkup(React.createElement(InstallAppButton));
assert.match(opened, /role="region"/);
assert.match(opened, /aria-expanded="true"/);
assert.match(opened, /Đóng hướng dẫn cài ứng dụng/);
assert.doesNotMatch(opened, /\babsolute\b|\bfixed\b|\bz-20\b/);
state = { ready: true, standalone: true };
assert.equal(renderToStaticMarkup(React.createElement(InstallAppButton)), "", "Standalone hides even previously open guidance");
console.log("PASS install UI: no SSR/detection flash, no standalone CTA/help, compact browser option, no QA copy");
console.log("PASS open help: in-flow region, expanded control, reachable close action, no floating overlay; standalone hides open help");
