"use client";

import { BellRing, ClipboardList, Grid3X3, HandPlatter } from "lucide-react";
import { useState, type ReactNode } from "react";

type StaffTabKey = "ready" | "requests" | "tables" | "orders";

const tabs = [
  { key: "ready", label: "Món chờ đi", icon: HandPlatter },
  { key: "requests", label: "Yêu cầu khách", icon: BellRing },
  { key: "tables", label: "Khu vực & Bàn", icon: Grid3X3 },
  { key: "orders", label: "Order theo bàn", icon: ClipboardList }
] satisfies Array<{ key: StaffTabKey; label: string; icon: typeof HandPlatter }>;

export type StaffTabCounts = Record<StaffTabKey, {
  total: number;
  actionable: number;
}>;

const totalLabels: Record<StaffTabKey, string> = {
  ready: "món đang chờ",
  requests: "yêu cầu đang mở",
  tables: "bàn",
  orders: "bàn có order"
};

export function StaffWorkspaceTabs({
  ready,
  requests,
  tables,
  orders,
  counts
}: {
  ready: ReactNode;
  requests: ReactNode;
  tables: ReactNode;
  orders: ReactNode;
  counts: StaffTabCounts;
}) {
  const [activeTab, setActiveTab] = useState<StaffTabKey>("ready");

  return (
    <section className="mx-auto w-full max-w-7xl px-3 py-4 sm:px-4 sm:py-5">
      <div className="sticky top-0 z-20 -mx-3 border-b bg-slate-50/95 px-3 py-2 backdrop-blur sm:-mx-4 sm:px-4">
        <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            const count = counts[tab.key];
            return (
              <button
                key={tab.key}
                className={`min-w-0 rounded-lg border px-3 py-2.5 text-left transition ${
                  activeTab === tab.key
                    ? "border-teal-700 bg-teal-700 text-white shadow-sm"
                    : "border-slate-200 bg-white text-slate-700 hover:border-teal-200 hover:bg-teal-50/40"
                }`}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                aria-pressed={activeTab === tab.key}
              >
                <span className="flex items-center gap-2">
                  <Icon className="h-4 w-4 shrink-0" />
                  <span className="min-w-0 flex-1 truncate text-sm font-semibold">{tab.label}</span>
                  {count.actionable > 0 ? (
                    <span className={`inline-flex min-w-6 items-center justify-center rounded-full px-1.5 py-0.5 text-xs font-bold ${activeTab === tab.key ? "bg-white text-red-700" : "bg-red-600 text-white"}`}>
                      {count.actionable > 99 ? "99+" : count.actionable}
                    </span>
                  ) : null}
                </span>
                <span className={`mt-1 block truncate pl-6 text-[11px] ${activeTab === tab.key ? "text-teal-50" : "text-slate-500"}`}>
                  {count.total} {totalLabels[tab.key]}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="mt-4 min-w-0">
        {activeTab === "ready" ? ready : null}
        {activeTab === "requests" ? requests : null}
        {activeTab === "tables" ? tables : null}
        {activeTab === "orders" ? orders : null}
      </div>
    </section>
  );
}
