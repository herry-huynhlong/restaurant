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
      document.querySelectorAll<HTMLInputElement>('input[type="password"]').forEach((input) => {
        input.value = "";
      });
      setMessage({ type: "success", text: success });
      timerRef.current = window.setTimeout(() => setMessage(null), 4500);
      return;
    }

    if (error) {
      setMessage({ type: "error", text: error });
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

export function StaffDirectoryFilters() {
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<"ALL" | "WORKING" | "OFF_SHIFT">("ALL");

  useEffect(() => {
    const normalizedQuery = normalizeText(query);
    const cards = Array.from(document.querySelectorAll<HTMLElement>("[data-staff-card]"));

    cards.forEach((card) => {
      const matchesQuery = !normalizedQuery
        || card.dataset.staffName?.includes(normalizedQuery)
        || card.dataset.staffUsername?.includes(normalizedQuery);
      const matchesStatus = status === "ALL" || card.dataset.staffStatus === status;
      card.hidden = !(matchesQuery && matchesStatus);
    });

    document.querySelectorAll<HTMLElement>("[data-staff-group]").forEach((group) => {
      const visibleCards = group.querySelectorAll<HTMLElement>("[data-staff-card]:not([hidden])");
      const emptyState = group.querySelector<HTMLElement>("[data-staff-group-empty]");
      if (emptyState) emptyState.hidden = visibleCards.length > 0;
    });
  }, [query, status]);

  return (
    <section className="rounded-2xl border bg-white p-4 shadow-sm">
      <div className="grid gap-3 lg:grid-cols-[1fr_auto] lg:items-end">
        <label className="block text-sm font-medium">
          Tìm nhân viên
          <input
            className="mt-2 h-11 w-full rounded-xl border px-3 outline-none focus:border-teal-600"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Nhập tên hoặc tên đăng nhập"
          />
        </label>
        <div className="flex flex-wrap gap-2">
          {[
            ["ALL", "Tất cả"],
            ["WORKING", "Đang trong ca"],
            ["OFF_SHIFT", "Ngoài ca"]
          ].map(([value, label]) => (
            <button
              key={value}
              className={`h-11 rounded-xl border px-4 text-sm font-semibold transition ${status === value ? "border-teal-700 bg-teal-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
              type="button"
              onClick={() => setStatus(value as "ALL" | "WORKING" | "OFF_SHIFT")}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
    </section>
  );
}

function normalizeText(value: string) {
  return value.trim().toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}
