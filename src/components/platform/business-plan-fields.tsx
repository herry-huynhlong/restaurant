"use client";

import { useState } from "react";

export function BusinessPlanFields({
  defaultBusinessType = "RESTAURANT",
  defaultPlan = "BASIC"
}: {
  defaultBusinessType?: string | null;
  defaultPlan?: string | null;
}) {
  const [businessType, setBusinessType] = useState(defaultBusinessType === "DRINK_SHOP" ? "DRINK_SHOP" : "RESTAURANT");
  const [plan, setPlan] = useState(defaultPlan === "PRO" ? "PRO" : "BASIC");
  const isDrinkShop = businessType === "DRINK_SHOP";

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
        Plan
        <select
          className="mt-1 h-10 w-full rounded-md border bg-white px-3 outline-none focus:border-teal-600 disabled:bg-slate-100"
          name="plan"
          value={isDrinkShop ? "BASIC" : plan}
          disabled={isDrinkShop}
          onChange={(event) => setPlan(event.currentTarget.value)}
        >
          <option value="BASIC">BASIC</option>
          {!isDrinkShop ? <option value="PRO">PRO</option> : null}
        </select>
        {isDrinkShop ? (
          <>
            <input name="plan" type="hidden" value="BASIC" />
            <span className="mt-1 block text-xs text-slate-500">Quán nước dùng feature set BASIC.</span>
          </>
        ) : null}
      </label>
    </>
  );
}
