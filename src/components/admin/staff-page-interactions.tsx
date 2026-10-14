"use client";

import { useEffect, useRef, useState } from "react";
import { useFormStatus } from "react-dom";

export function StaffPageInteractions({ success, error }: { success?: string; error?: string }) {
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    if (timerRef.current) window.clearTimeout(timerRef.current);

    if (success) {
      document.querySelectorAll<HTMLDetailsElement>("[data-staff-panel]").forEach((panel) => {
        panel.open = false;
      });
      setMessage({ type: "success", text: success });
      timerRef.current = window.setTimeout(() => setMessage(null), 4500);
      return;
    }

    if (error) {
      setMessage({ type: "error", text: error });
      timerRef.current = window.setTimeout(() => setMessage(null), 5000);
    }
  }, [success, error]);

  if (!message) return null;

  return (
    <div className={`fixed right-4 top-4 z-50 flex max-w-sm items-start gap-3 rounded-xl px-4 py-3 text-sm font-medium shadow-lg ${message.type === "success" ? "bg-teal-700 text-white" : "bg-red-600 text-white"}`}>
      <span className="min-w-0 flex-1">{message.text}</span>
      <button className="shrink-0 rounded px-1 text-lg leading-none opacity-80 hover:opacity-100" type="button" onClick={() => setMessage(null)} aria-label="Đóng thông báo">
        ×
      </button>
    </div>
  );
}

export function StaffSubmitButton({
  children,
  pendingLabel,
  className
}: {
  children: React.ReactNode;
  pendingLabel: string;
  className: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button className={`${className} disabled:cursor-wait disabled:opacity-60`} type="submit" disabled={pending}>
      {pending ? pendingLabel : children}
    </button>
  );
}

export function CopyLoginLinkButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <button
      className="rounded-md border px-3 py-2 text-sm font-semibold"
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(url);
        setCopied(true);
        window.setTimeout(() => setCopied(false), 1800);
      }}
    >
      {copied ? "Đã sao chép" : "Sao chép liên kết"}
    </button>
  );
}
