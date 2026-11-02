"use client";
import { createContext, useContext, useEffect, useRef, useState } from "react";
import { PwaInstallController, type InstallOutcome } from "@/lib/pwa-install-controller";
const InstallContext = createContext<{ ready: boolean; standalone: boolean; requested: boolean; requestInstall(): Promise<InstallOutcome> }>({ ready: false, standalone: false, requested: false, requestInstall: async () => "unavailable" });
export function PwaInstallProvider({ children }: { children: React.ReactNode }) {
  const controller = useRef<PwaInstallController | null>(null);
  const [ready, setReady] = useState(false);
  const [snapshot, setSnapshot] = useState({ standalone: false, requested: false });
  useEffect(() => {
    const media = window.matchMedia("(display-mode: standalone)");
    const instance = new PwaInstallController({
      path: () => window.location.pathname,
      manifest: () => document.querySelector('link[rel="manifest"]')?.getAttribute("href") ?? null,
      standalone: () => media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone),
      listen: (name, handler) => { window.addEventListener(name, handler); return () => window.removeEventListener(name, handler); },
      listenDisplay: handler => { media.addEventListener?.("change", handler); return () => media.removeEventListener?.("change", handler); }
    });
    controller.current = instance;
    const unsubscribe = instance.subscribe(() => setSnapshot(instance.getSnapshot()));
    instance.start();
    setReady(true);
    return () => { instance.stop(); unsubscribe(); controller.current = null; };
  }, []);
  return <InstallContext.Provider value={{ ...snapshot, ready, requestInstall: () => controller.current?.requestInstall() ?? Promise.resolve("unavailable") }}>{children}</InstallContext.Provider>;
}
export function usePwaInstall() { return useContext(InstallContext); }
