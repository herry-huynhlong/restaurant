"use client";

import { useState, type ReactNode } from "react";

type StaffTabKey = "ready" | "requests" | "tables" | "orders";

const tabs: Array<{ key: StaffTabKey; label: string }> = [
  { key: "ready", label: "Món chờ đi" },
  { key: "requests", label: "Yêu cầu khách" },
  { key: "tables", label: "Khu vực & Bàn" },
  { key: "orders", label: "Order theo bàn" }
];

export function StaffWorkspaceTabs({
  ready,
  requests,
  tables,
  orders
}: {
  ready: ReactNode;
  requests: ReactNode;
  tables: ReactNode;
  orders: ReactNode;
}) {
  const [activeTab, setActiveTab] = useState<StaffTabKey>("ready");

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-6">
      <div className="sticky top-0 z-20 -mx-4 border-b bg-slate-50/95 px-4 py-3 backdrop-blur">
        <div className="flex gap-2 overflow-x-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              className={`shrink-0 rounded-full px-4 py-2 text-sm font-semibold ${
                activeTab === tab.key ? "bg-teal-700 text-white shadow-sm" : "border bg-white text-slate-700"
              }`}
              type="button"
              onClick={() => setActiveTab(tab.key)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4">
        {activeTab === "ready" ? ready : null}
        {activeTab === "requests" ? requests : null}
        {activeTab === "tables" ? tables : null}
        {activeTab === "orders" ? orders : null}
      </div>
    </section>
  );
}
