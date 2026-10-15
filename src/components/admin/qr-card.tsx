"use client";

import { AlertTriangle, Copy, Download, Printer, RefreshCw } from "lucide-react";
import { useState } from "react";

const ticketTitle = "Quét mã để đặt món";

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
  const title = `${restaurantName} - Bàn ${tableName}`;

  async function downloadTicketPng() {
    try {
      const dataUrl = await createQrTicketPng({
        restaurantName,
        tableName,
        qrDataUrl
      });
      const link = document.createElement("a");
      link.href = dataUrl;
      link.download = `${filenameSlug(`qr-${restaurantName}-ban-${tableName}`)}.png`;
      link.click();
      setMessage("Đã tải phiếu QR.");
    } catch (error) {
      console.error("DOWNLOAD QR TICKET ERROR", error);
      setMessage("Không thể tải phiếu QR. Vui lòng thử lại.");
    }
  }

  function printQr() {
    const popup = window.open("", "_blank", "width=420,height=600");
    if (!popup) {
      setMessage("Không thể mở cửa sổ in. Vui lòng cho phép pop-up rồi thử lại.");
      return;
    }
    popup.document.write(renderPrintableTicket({
      restaurantName,
      tableName,
      qrDataUrl
    }));
    popup.document.close();
    popup.focus();
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
      console.error("REGENERATE QR CLIENT ERROR", error);
      setMessage("Không đổi được mã QR. Vui lòng thử lại.");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="rounded-lg border bg-white p-4 text-center shadow-sm">
      <div className="mx-auto max-w-sm rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <p className="text-lg font-bold leading-tight text-slate-950">{title}</p>
        <p className="mt-2 text-sm font-semibold text-teal-700">{ticketTitle}</p>
        <div className="mx-auto mt-4 w-fit rounded-2xl bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img alt={`QR đặt món ${title}`} className="h-52 w-52" src={qrDataUrl} />
        </div>
      </div>
      {message ? <p className="mt-2 rounded-md bg-slate-50 px-2 py-1 text-xs text-slate-700">{message}</p> : null}
      <div className="mt-3 flex flex-wrap justify-center gap-2">
        <button className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" type="button" onClick={() => void downloadTicketPng()}>
          <Download className="h-3 w-3" /> PNG
        </button>
        <button className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs" type="button" onClick={printQr}>
          <Printer className="h-3 w-3" /> In
        </button>
        <button
          className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs"
          type="button"
          onClick={async () => {
            await navigator.clipboard.writeText(qrUrl);
            setMessage("Đã sao chép liên kết.");
          }}
        >
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
        <div aria-modal="true" className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4 text-left" role="dialog">
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

function renderPrintableTicket({
  restaurantName,
  tableName,
  qrDataUrl
}: {
  restaurantName: string;
  tableName: string;
  qrDataUrl: string;
}) {
  const title = `${restaurantName} - Bàn ${tableName}`;
  return `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(title)}</title>
    <style>
      * { box-sizing: border-box; }
      body {
        margin: 0;
        background: #f8fafc;
        color: #020617;
        font-family: Arial, Helvetica, sans-serif;
      }
      .page {
        min-height: 100vh;
        display: flex;
        align-items: center;
        justify-content: center;
        padding: 24px;
      }
      .ticket {
        width: min(92vw, 420px);
        background: #fff;
        border: 1px solid #e2e8f0;
        border-radius: 24px;
        padding: 34px 28px;
        text-align: center;
      }
      h1 {
        margin: 0;
        font-size: 28px;
        line-height: 1.2;
      }
      p {
        margin: 12px 0 0;
        color: #087f75;
        font-size: 18px;
        font-weight: 700;
      }
      .qr-wrap {
        margin: 26px auto 0;
        width: 300px;
        max-width: 100%;
        padding: 16px;
        background: #fff;
      }
      img {
        display: block;
        width: 100%;
        height: auto;
      }
      @page {
        margin: 12mm;
      }
      @media print {
        body { background: #fff; }
        .page { min-height: auto; padding: 0; }
        .ticket { box-shadow: none; }
      }
    </style>
  </head>
  <body>
    <main class="page">
      ${renderTicketMarkup(title, qrDataUrl)}
    </main>
    <script>
      window.addEventListener("load", () => {
        window.print();
      });
    </script>
  </body>
</html>`;
}

function renderTicketMarkup(title: string, qrDataUrl: string) {
  return `<section class="ticket">
    <h1>${escapeHtml(title)}</h1>
    <p>${ticketTitle}</p>
    <div class="qr-wrap">
      <img src="${escapeAttribute(qrDataUrl)}" alt="${escapeAttribute(title)}" />
    </div>
  </section>`;
}

async function createQrTicketPng({
  restaurantName,
  tableName,
  qrDataUrl
}: {
  restaurantName: string;
  tableName: string;
  qrDataUrl: string;
}) {
  const canvas = document.createElement("canvas");
  const width = 1200;
  const height = 1500;
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("canvas_unavailable");

  const title = `${restaurantName} - Bàn ${tableName}`;
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = "#020617";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = "700 64px Arial, Helvetica, sans-serif";
  wrapCanvasText(context, title, width / 2, 190, 980, 78);

  context.fillStyle = "#087f75";
  context.font = "700 44px Arial, Helvetica, sans-serif";
  context.fillText(ticketTitle, width / 2, 340);

  const qrImage = await loadImage(qrDataUrl);
  const qrSize = 760;
  const qrX = (width - qrSize) / 2;
  const qrY = 470;
  context.fillStyle = "#ffffff";
  context.fillRect(qrX - 48, qrY - 48, qrSize + 96, qrSize + 96);
  context.drawImage(qrImage, qrX, qrY, qrSize, qrSize);

  return canvas.toDataURL("image/png");
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("image_load_failed"));
    image.src = src;
  });
}

function wrapCanvasText(context: CanvasRenderingContext2D, text: string, x: number, y: number, maxWidth: number, lineHeight: number) {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let line = "";

  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (context.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  const startY = y - ((lines.length - 1) * lineHeight) / 2;
  for (const [index, value] of lines.entries()) {
    context.fillText(value, x, startY + index * lineHeight);
  }
}

function filenameSlug(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "qr-ban";
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function escapeAttribute(value: string) {
  return escapeHtml(value).replace(/`/g, "&#096;");
}
