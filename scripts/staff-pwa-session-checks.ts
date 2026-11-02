import assert from "node:assert/strict";
import { staffDeviceBrowser } from "./helpers/staff-device-browser";
import { PwaInstallController, type DeferredInstallEvent } from "../src/lib/pwa-install-controller";
import { startupDestination } from "../src/lib/staff-pwa-startup";
import { recoverStaffAccess } from "../src/lib/staff-access-recovery";

async function main() {
  const old = "safari-device-12345678";
  for (const storage of [new Map<string, string>(), new Map([["staffDeviceId", "old-storage-98765432"]])]) {
    const browser = staffDeviceBrowser(new Map([["staffDeviceId", old]]), { storage });
    assert.equal(browser.getId(), old); assert.equal(browser.writes.length, 0);
  }
  const blocked = staffDeviceBrowser(new Map([["staffDeviceId", old]]), { storageBlocked: true });
  assert.equal(blocked.getId(), old);
  const legacy = staffDeviceBrowser(new Map(), { storage: new Map([["staffDeviceId", old]]), https: true });
  assert.equal(legacy.getId(), old); assert.ok(legacy.writes[0].includes("; Secure"));
  const fresh = staffDeviceBrowser(new Map(), { storageBlocked: true });
  const id = fresh.getId(); assert.equal(fresh.getId(), id); assert.equal(fresh.writes.length, 1);
  assert.throws(() => staffDeviceBrowser(new Map([["staffDeviceId", "bad"]])).getId(), /không hợp lệ/);
  assert.throws(() => staffDeviceBrowser(new Map(), { cookiesBlocked: true }).getId(), /chưa lưu được/);
  console.log("PASS device identity: copied cookie, stale/empty/blocked storage, legacy, Secure, repeat, malformed and blocked cookie");

  const events = new EventTarget();
  const display = new EventTarget();
  let path = "/tenant-a/login", standalone = false, calls = 0;
  let manifest = "/tenant-a/staff/manifest.webmanifest";
  const controller = new PwaInstallController({
    path: () => path, standalone: () => standalone,
    manifest: () => manifest,
    listen(name, handler) { events.addEventListener(name, handler); return () => events.removeEventListener(name, handler); },
    listenDisplay(handler) { display.addEventListener("change", handler); return () => display.removeEventListener("change", handler); }
  });
  const prompt = (outcome: "accepted" | "dismissed", fail = false) => Object.assign(new Event("beforeinstallprompt", { cancelable: true }), { prompt: async () => { calls++; if (fail) throw Error("install failed"); }, userChoice: Promise.resolve({ outcome }) }) as DeferredInstallEvent;
  controller.start();
  assert.equal(await controller.requestInstall(), "unavailable");
  // Captured on login before the workspace install button mounts.
  const early = prompt("accepted"); events.dispatchEvent(early); assert.equal(early.defaultPrevented, true);
  path = "/tenant-a/staff";
  const installing = controller.requestInstall();
  assert.equal(await controller.requestInstall(), "unavailable");
  assert.equal(await installing, "accepted"); assert.equal(calls, 1); assert.equal(controller.getSnapshot().requested, true);
  events.dispatchEvent(prompt("dismissed")); assert.equal(await controller.requestInstall(), "dismissed");
  events.dispatchEvent(prompt("accepted", true)); assert.equal(await controller.requestInstall(), "error");
  events.dispatchEvent(prompt("accepted")); manifest = "/tenant-b/staff/manifest.webmanifest";
  assert.equal(await controller.requestInstall(), "unavailable", "Do not install a deferred prompt belonging to another tenant/department");
  events.dispatchEvent(prompt("accepted")); assert.equal(await controller.requestInstall(), "accepted");
  standalone = true; display.dispatchEvent(new Event("change")); assert.equal(controller.getSnapshot().standalone, true);
  events.dispatchEvent(prompt("accepted")); assert.equal(await controller.requestInstall(), "unavailable");
  standalone = false; display.dispatchEvent(new Event("change"));
  path = "/tenant-a/welcome"; const customer = prompt("accepted"); events.dispatchEvent(customer); assert.equal(customer.defaultPrevented, false);
  controller.stop(); path = "/tenant-a/login"; const stopped = prompt("accepted"); events.dispatchEvent(stopped); assert.equal(stopped.defaultPrevented, false);
  console.log("PASS installer: unavailable/iOS instructions path, early event, both ordering flows, double click, cancel, failure/retry, standalone and customer isolation");
  assert.equal(startupDestination({ state: "READY", workspace: "/a/staff", role: "WAITER" }), "/a/staff");
  assert.equal(startupDestination({ state: "NO_SESSION" }), null);
  assert.equal(startupDestination({ state: "DEVICE_REVOKED" }), null);
  assert.equal(startupDestination({ state: "NETWORK_ERROR" }), null);
  assert.equal(startupDestination({ state: "FORBIDDEN" }), "/unauthorized");
  console.log("PASS startup destinations: no blind re-login for device/network state");

  const oldFetch = globalThis.fetch;
  const oldWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
  const navigations: string[] = [];
  Object.defineProperty(globalThis, "window", { configurable: true, value: { location: { pathname: "/tenant-a/staff", replace: (target: string) => navigations.push(target) }, setTimeout, clearTimeout } });
  try {
    for (const [state, destination] of [
      [{ state: "DEVICE_SETUP_REQUIRED", role: "WAITER", setupPath: "/tenant-a/device-setup" }, "/tenant-a/device-setup"],
      [{ state: "NO_SESSION" }, "/tenant-a/login?pwa=1&role=WAITER"],
      [{ state: "DEVICE_REVOKED" }, "/tenant-a/login?pwa=1&role=WAITER"],
      [{ state: "FORBIDDEN" }, "/unauthorized"]
    ] as const) {
      navigations.length = 0;
      globalThis.fetch = async () => new Response(JSON.stringify(state), { headers: { "content-type": "application/json" } });
      assert.equal(await recoverStaffAccess("tenant-a", new Response(null, { status: 403 })), true);
      assert.deepEqual(navigations, [destination]);
    }
    navigations.length = 0;
    globalThis.fetch = async () => { throw Error("offline"); };
    assert.equal(await recoverStaffAccess("tenant-a", new Response(null, { status: 401 })), true);
    assert.equal(navigations.length, 0, "Network failure must not navigate to password or revoke the device");
    let requests = 0;
    globalThis.fetch = async () => { requests++; return new Response(JSON.stringify({ state: "NETWORK_ERROR" })); };
    await Promise.all([1, 2, 3].map(() => recoverStaffAccess("tenant-a", new Response(null, { status: 403 }))));
    assert.equal(requests, 1, "Concurrent header/notification recovery shares one status request");
    console.log("PASS access recovery: typed session/device/permission states, offline preservation, deduplicated requests");
  } finally {
    globalThis.fetch = oldFetch;
    if (oldWindow) Object.defineProperty(globalThis, "window", oldWindow);
    else Reflect.deleteProperty(globalThis, "window");
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
