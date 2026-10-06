"use client";

import { Copy, Download, Printer } from "lucide-react";

export function QrCard({
  restaurantName,
  tableName,
  qrDataUrl,
  qrUrl
}: {
  restaurantName: string;
  tableName: string;
  qrDataUrl: string;
  qrUrl: string;
}) {
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

  return (
    <div className="rounded-lg border bg-white p-4 text-center shadow-sm">
      <p className="text-sm font-semibold">{restaurantName}</p>
      <p className="mt-1 text-lg font-bold">Bàn {tableName}</p>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img alt={`QR bàn ${tableName}`} className="mx-auto mt-3 h-36 w-36" src={qrDataUrl} />
      <p className="mt-2 text-xs text-slate-500 break-all">{qrUrl}</p>
      <div className="mt-3 flex justify-center gap-2">
        <a className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" download={`qr-${tableName}.png`} href={qrDataUrl}>
          <Download className="h-3 w-3" /> PNG
        </a>
        <button className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" type="button" onClick={printQr}>
          <Printer className="h-3 w-3" /> In
        </button>
        <button className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" type="button" onClick={() => navigator.clipboard.writeText(qrUrl)}>
          <Copy className="h-3 w-3" /> Link
        </button>
      </div>
    </div>
  );
}
