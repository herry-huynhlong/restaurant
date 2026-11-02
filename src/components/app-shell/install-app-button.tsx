"use client";

import { Download } from "lucide-react";
import { useState } from "react";
import {installHelp} from '@/lib/install-help';
import { usePwaInstall } from "./pwa-install-provider";

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const { ready, standalone, requestInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<ReturnType<typeof installHelp>|null>(null);

  async function install() {
    if (standalone || busy) return;
    setBusy(true);
    try {
      // Invoke the browser prompt immediately within the click's user activation.
      const outcome = await requestInstall();
      if (outcome === "accepted") setHelp({ title: "Mở ứng dụng từ màn hình chính", steps: ["Mở biểu tượng ứng dụng vừa thêm.", "Ứng dụng sẽ kiểm tra phiên và quyền của bạn trong đúng nhà hàng."] });
      else if (outcome !== "dismissed") setHelp(installHelp(navigator.userAgent,navigator.maxTouchPoints));
    } finally { setBusy(false); }
  }

  if (!ready || standalone) return null;

  return (
    <div className="relative">
      <button
        className={compact ? "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50" : "inline-flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"}
        type="button"
        disabled={busy}
        onClick={install}
      >
        <Download className="h-4 w-4" />
        {busy ? "Đang mở hướng dẫn…" : "Cài App"}
      </button>
      {help ? (
        <div className="absolute right-0 z-20 mt-2 w-72 max-w-[calc(100vw-3rem)] rounded-lg border bg-white p-4 text-sm shadow-lg">
          <p className="font-semibold">{help.title}</p>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">
            {help.steps.map(step=><li key={step}>{step}</li>)}
          </ol>
          <button className="mt-3 rounded-md border px-3 py-1" type="button" onClick={() => setHelp(null)}>
            Đóng
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function StaffPwaInstallOptions() {
  const { ready, standalone } = usePwaInstall();
  if (!ready || standalone) return null;
  return (
    <div className="mt-5 flex items-center justify-between gap-3 border-t pt-4">
      <p className="text-xs text-slate-500">Truy cập nhanh từ màn hình chính.</p>
      <div className="shrink-0"><InstallAppButton compact /></div>
    </div>
  );
}
