import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import vm from "node:vm";
import ts from "typescript";

// Execute the actual client helper with a simulated cookie/localStorage boundary.
// HttpOnly auth cookies are deliberately invisible to the helper.
export function staffDeviceBrowser(jar = new Map<string, string>(), options: { storage?: Map<string, string>; storageBlocked?: boolean; cookiesBlocked?: boolean; https?: boolean } = {}) {
  const storage = options.storage ?? new Map<string, string>();
  const writes: string[] = [];
  const sandbox = {
    exports: {} as { getStaffDeviceId(): string },
    document: {
      get cookie() { return jar.has("staffDeviceId") ? `staffDeviceId=${encodeURIComponent(jar.get("staffDeviceId")!)}` : ""; },
      set cookie(value: string) { writes.push(value); if (!options.cookiesBlocked) { const [name, ...rest] = value.split(";")[0].split("="); jar.set(name, decodeURIComponent(rest.join("="))); } }
    },
    localStorage: {
      getItem(key: string) { if (options.storageBlocked) throw Error("SecurityError"); return storage.get(key) ?? null; },
      setItem(key: string, value: string) { if (options.storageBlocked) throw Error("SecurityError"); storage.set(key, value); }
    },
    window: { location: { protocol: options.https ? "https:" : "http:" }, dispatchEvent() {} },
    navigator: { platform: "QA" }, crypto: { randomUUID }, Date, Math, CustomEvent
  };
  const source = readFileSync("src/lib/staff-device.ts", "utf8");
  vm.runInNewContext(ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, sandbox);
  return { getId: () => sandbox.exports.getStaffDeviceId(), jar, writes, storage };
}
