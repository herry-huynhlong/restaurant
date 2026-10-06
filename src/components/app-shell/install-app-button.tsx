"use client";

import { Download } from "lucide-react";
import { useEffect, useState } from "react";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isIosSafari() {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(ua) && /safari/.test(ua) && !/crios|fxios/.test(ua);
}

function isStandalone() {
  return window.matchMedia("(display-mode: standalone)").matches || ("standalone" in navigator && Boolean((navigator as { standalone?: boolean }).standalone));
}

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const [promptEvent, setPromptEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [iosHelp, setIosHelp] = useState(false);

  useEffect(() => {
    setInstalled(isStandalone());
    const handler = (event: Event) => {
      event.preventDefault();
      setPromptEvent(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    window.addEventListener("appinstalled", () => setInstalled(true));
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  async function install() {
    if (installed) return;
    if (promptEvent) {
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      if (choice.outcome === "accepted") setInstalled(true);
      setPromptEvent(null);
      return;
    }
    if (isIosSafari()) {
      setIosHelp(true);
      return;
    }
    setIosHelp(true);
  }

  return (
    <div className="relative">
      <button
        className={compact ? "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50" : "inline-flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"}
        type="button"
        onClick={install}
      >
        <Download className="h-4 w-4" />
        {installed ? "Đã cài App" : "Cài App"}
      </button>
      {iosHelp ? (
        <div className="absolute right-0 z-20 mt-2 w-72 rounded-lg border bg-white p-4 text-sm shadow-lg">
          <p className="font-semibold">Cài ứng dụng trên thiết bị</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">
            <li>Nhấn nút Chia sẻ của trình duyệt.</li>
            <li>Chọn Thêm vào Màn hình chính.</li>
            <li>Nhấn Thêm.</li>
          </ol>
          <button className="mt-3 rounded-md border px-3 py-1" type="button" onClick={() => setIosHelp(false)}>
            Đóng
          </button>
        </div>
      ) : null}
    </div>
  );
}
