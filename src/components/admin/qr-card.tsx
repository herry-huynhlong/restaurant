"use client";

import { AlertTriangle, Copy, Download, Printer, RefreshCw } from "lucide-react";
import { useState } from "react";

export function QrCard({
  restaurantName,
  tableName,
  tableId,
  slug,
  qrDataUrl,
  qrUrl,
  onRegenerated
}: {
  restaurantName: string;
  tableName: string;
  tableId?: string;
  slug?: string;
  qrDataUrl: string;
  qrUrl: string;
  onRegenerated?: () => Promise<void> | void;
}) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  function printQr() {
    const popup = window.open("", "_blank", "width=420,height=600");
    if (!popup) return;
    popup.document.write(`
      <html><head><title>QR ${tableName}</title></head>
      <body style="font-family: Arial; text-align:center; padding:24px">
        <h2>${restaurantName}</h2>
        <p>Quét để gọi món<br/>Scan to order</p>
        <img src="${qrDataUrl}" width="260" height="260" />
        <h3>BÀN ${tableName}</h3>
      </body></html>
    `);
    popup.document.close();
    popup.print();
  }

  async function regenerateQr() {
    if (!slug || !tableId || pending) return;
    setPending(true);
    setMessage(null);
    try {
      const response = await fetch(`/api/restaurants/${slug}/admin/tables/${tableId}/regenerate-qr`, {
        method: "POST"
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.success) {
        throw new Error(data.message || "Không đổi được mã QR.");
      }
      setConfirmOpen(false);
      setMessage("Đã tạo mã QR mới.");
      await onRegenerated?.();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không đổi được mã QR.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4 text-center shadow-sm">
      <p className="text-sm font-semibold">{restaurantName}</p>
      <p className="mt-1 text-lg font-bold">Bàn {tableName}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={`QR bàn ${tableName}`} className="mx-auto mt-3 h-36 w-36" src={qrDataUrl} />
      <p className="mt-2 text-xs text-slate-500 break-all">{qrUrl}</p>
      {message ? <p className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">{message}</p> : null}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <a className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" download={`qr-${tableName}.png`} href={qrDataUrl}>
          <Download className="h-3 w-3" /> PNG
        </a>
        <button className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" type="button" onClick={printQr}>
          <Printer className="h-3 w-3" /> In
        </button>
        <button className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" type="button" onClick={() => navigator.clipboard.writeText(qrUrl)}>
          <Copy className="h-3 w-3" /> Link
        </button>
        {slug && tableId ? (
          <button
            className="inline-flex items-center gap-1 rounded-md border border-amber-300 px-2 py-1 text-xs font-semibold text-amber-700 hover:bg-amber-50 disabled:cursor-not-allowed disabled:opacity-60"
            type="button"
            disabled={pending}
            onClick={() => setConfirmOpen(true)}
          >
            <RefreshCw className="h-3 w-3" /> Đổi mã QR
          </button>
        ) : null}
      </div>
      {confirmOpen ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 text-left">
          <div className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl">
            <div className="flex items-start gap-3">
              <span className="rounded-full bg-amber-50 p-2 text-amber-700">
                <AlertTriangle className="h-5 w-5" />
              </span>
              <div>
                <h3 className="text-lg font-semibold">Đổi mã QR của Bàn {tableName}?</h3>
                <p className="mt-2 text-sm text-slate-600">
                  Mã QR cũ và QR đã in sẽ không còn hiệu lực. Bạn cần tải hoặc in lại mã QR mới cho bàn này.
                </p>
              </div>
            </div>
            <div className="mt-5 flex justify-end gap-2">
              <button
                className="rounded-md border px-3 py-2 text-sm font-semibold hover:bg-slate-50"
                type="button"
                disabled={pending}
                onClick={() => setConfirmOpen(false)}
              >
                Hủy
              </button>
              <button
                className="rounded-md bg-amber-600 px-3 py-2 text-sm font-semibold text-white hover:bg-amber-700 disabled:cursor-not-allowed disabled:bg-slate-300"
                type="button"
                disabled={pending}
                onClick={() => void regenerateQr()}
              >
                {pending ? "Đang đổi..." : "Xác nhận đổi mã"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
