"use client";

import { Download } from "lucide-react";
import { useId, useRef, useState } from "react";
import {installHelp} from '@/lib/install-help';
import { usePwaInstall } from "./pwa-install-provider";

export function InstallAppButton({ compact = false }: { compact?: boolean }) {
  const { ready, standalone, requestInstall } = usePwaInstall();
  const [busy, setBusy] = useState(false);
  const [help, setHelp] = useState<ReturnType<typeof installHelp>|null>(null);
  const helpId = useId();
  const buttonRef = useRef<HTMLButtonElement>(null);

  function closeHelp() {
    setHelp(null);
    buttonRef.current?.focus({ preventScroll: true });
  }

  async function install() {
    if (standalone || busy) return;
    if (help) { closeHelp(); return; }
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
    <div className={help ? "w-full min-w-0 basis-full" : "min-w-0 max-w-full"}>
      <button
        className={compact ? "inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50" : "inline-flex w-full items-center gap-2 rounded-md border px-3 py-2 text-sm hover:bg-slate-50"}
        type="button"
        disabled={busy}
        onClick={install}
        ref={buttonRef}
        aria-expanded={Boolean(help)}
        aria-controls={help ? helpId : undefined}
      >
        <Download className="h-4 w-4" />
        {busy ? "Đang mở hướng dẫn…" : "Cài App"}
      </button>
      {help ? (
        <section
          id={helpId}
          role="region"
          aria-label="Hướng dẫn cài ứng dụng"
          className="mt-3 w-full min-w-0 max-w-sm rounded-lg border bg-slate-50 p-3 text-sm [overflow-wrap:anywhere]"
          onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); closeHelp(); } }}
        >
          <div className="flex items-start justify-between gap-3">
            <p className="font-semibold">{help.title}</p>
            <button className="min-h-11 shrink-0 rounded-md border bg-white px-3 py-2" type="button" aria-label="Đóng hướng dẫn cài ứng dụng" onClick={closeHelp}>
              Đóng
            </button>
          </div>
          <ol className="mt-2 list-decimal space-y-1 pl-5 text-slate-600">
            {help.steps.map(step=><li key={step}>{step}</li>)}
          </ol>
        </section>
      ) : null}
    </div>
  );
}

export function StaffPwaInstallOptions() {
  const { ready, standalone } = usePwaInstall();
  if (!ready || standalone) return null;
  return (
    <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t pt-4">
      <p className="text-xs text-slate-500">Truy cập nhanh từ màn hình chính.</p>
      <InstallAppButton compact />
    </div>
  );
}
