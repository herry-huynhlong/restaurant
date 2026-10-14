"use client";

import { useState } from "react";

export function BusinessPlanFields({
  defaultBusinessType = "RESTAURANT",
  defaultPlan = "BASIC",
  defaultPlanEntitlement = "BASIC"
}: {
  defaultBusinessType?: string | null;
  defaultPlan?: string | null;
  defaultPlanEntitlement?: string | null;
}) {
  const [businessType, setBusinessType] = useState(defaultBusinessType === "DRINK_SHOP" ? "DRINK_SHOP" : "RESTAURANT");
  const [plan, setPlan] = useState(defaultPlan === "TRAIN" ? "TRAIN" : defaultPlan === "PRO" ? "PRO" : "BASIC");
  const [planEntitlement, setPlanEntitlement] = useState(defaultPlanEntitlement === "PRO" ? "PRO" : defaultPlan === "PRO" ? "PRO" : "BASIC");
  const isDrinkShop = businessType === "DRINK_SHOP";
  const effectivePlan = isDrinkShop && plan !== "TRAIN" ? "BASIC" : plan;

  return (
    <>
      <label className="block text-sm font-medium">
        Loại hình
        <select
          className="mt-1 h-10 w-full rounded-md border bg-white px-3 outline-none focus:border-teal-600"
          name="businessType"
          value={businessType}
          onChange={(event) => setBusinessType(event.currentTarget.value)}
        >
          <option value="RESTAURANT">Nhà hàng</option>
          <option value="DRINK_SHOP">Quán nước</option>
        </select>
      </label>
      <label className="block text-sm font-medium">
        Gói dịch vụ
        <select
          className="mt-1 h-10 w-full rounded-md border bg-white px-3 outline-none focus:border-teal-600 disabled:bg-slate-100"
          name="plan"
          value={effectivePlan}
          onChange={(event) => setPlan(event.currentTarget.value)}
        >
          <option value="TRAIN">TRAIN</option>
          <option value="BASIC">BASIC</option>
          {!isDrinkShop ? <option value="PRO">PRO</option> : null}
        </select>
        {isDrinkShop && plan === "PRO" ? (
          <>
            <input name="plan" type="hidden" value="BASIC" />
            <span className="mt-1 block text-xs text-slate-500">Quán nước dùng quyền BASIC khi dùng gói trả phí.</span>
          </>
        ) : null}
      </label>
      {effectivePlan === "TRAIN" ? (
        <label className="block text-sm font-medium">
          Quyền sử dụng TRAIN
          <select
            className="mt-1 h-10 w-full rounded-md border bg-white px-3 outline-none focus:border-teal-600"
            name="planEntitlement"
            value={planEntitlement}
            onChange={(event) => setPlanEntitlement(event.currentTarget.value)}
          >
            <option value="BASIC">Quyền BASIC</option>
            <option value="PRO">Quyền PRO</option>
          </select>
          <span className="mt-1 block text-xs text-slate-500">TRAIN miễn phí, chỉ QuánPilot Admin cấu hình thời hạn.</span>
        </label>
      ) : (
        <input name="planEntitlement" type="hidden" value={effectivePlan === "PRO" ? "PRO" : "BASIC"} />
      )}
    </>
  );
}
