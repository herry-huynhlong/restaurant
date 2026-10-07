"use client";

import { useId, useRef, useState } from "react";
import { changePlanAction, resetOwnerPasswordAction, setRestaurantStatusAction } from "@/app/platform/restaurants/actions";

type RestaurantActionProps = {
  restaurantId: string;
  restaurantName: string;
  status: string;
  plan: string;
  returnTo: string;
  compact?: boolean;
};

export function PlatformRestaurantActions({
  restaurantId,
  restaurantName,
  status,
  plan,
  returnTo,
  compact = false
}: RestaurantActionProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const passwordId = useId();
  const confirmPasswordId = useId();
  const [password, setPassword] = useState("");
  const isLocked = status === "SUSPENDED";
  const nextStatus = isLocked ? "ACTIVE" : "SUSPENDED";
  const statusLabel = isLocked ? "Mở" : "Khóa";
  const confirmMessage = isLocked
    ? `Mở lại nhà hàng ${restaurantName}?`
    : `Khóa nhà hàng ${restaurantName}?\n\nTất cả tài khoản thuộc nhà hàng này sẽ không thể đăng nhập hoặc sử dụng hệ thống cho đến khi được mở lại.`;

  return (
    <div className={`flex flex-wrap gap-2 ${compact ? "items-center" : ""}`}>
      <form action={setRestaurantStatusAction}>
        <input name="restaurantId" type="hidden" value={restaurantId} />
        <input name="status" type="hidden" value={nextStatus} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <button
          className={`rounded-md border px-2 py-1 text-sm ${isLocked ? "" : "border-red-200 text-red-700"}`}
          type="submit"
          onClick={(event) => {
            if (!window.confirm(confirmMessage)) {
              event.preventDefault();
            }
          }}
        >
          {statusLabel}
        </button>
      </form>

      <form className="flex gap-1" action={changePlanAction}>
        <input name="restaurantId" type="hidden" value={restaurantId} />
        <input name="returnTo" type="hidden" value={returnTo} />
        <select className="rounded-md border px-1 py-1 text-sm" name="plan" defaultValue={plan} aria-label="Gói dịch vụ">
          <option value="FREE">FREE</option>
          <option value="BASIC">BASIC</option>
          <option value="PRO">PRO</option>
        </select>
        <button className="rounded-md border px-2 py-1 text-sm" type="submit">Đổi gói</button>
      </form>

      <button className="rounded-md border px-2 py-1 text-sm" type="button" onClick={() => dialogRef.current?.showModal()}>
        Reset pass admin
      </button>

      <dialog ref={dialogRef} className="w-full max-w-md rounded-lg border bg-white p-0 shadow-xl backdrop:bg-black/30">
        <form className="space-y-4 p-5" action={resetOwnerPasswordAction}>
          <input name="restaurantId" type="hidden" value={restaurantId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div>
            <h2 className="text-lg font-semibold">Reset mật khẩu admin</h2>
            <p className="mt-1 text-sm text-slate-600">Nhà hàng: {restaurantName}</p>
          </div>
          <label className="block text-sm font-medium" htmlFor={passwordId}>
            Mật khẩu mới
            <input
              id={passwordId}
              className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
              value={password}
              onChange={(event) => setPassword(event.currentTarget.value)}
            />
          </label>
          <label className="block text-sm font-medium" htmlFor={confirmPasswordId}>
            Xác nhận mật khẩu
            <input
              id={confirmPasswordId}
              className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
              name="confirmPassword"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
              pattern={escapePattern(password)}
              title="Xác nhận mật khẩu phải khớp."
            />
          </label>
          <div className="flex justify-end gap-2">
            <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={() => dialogRef.current?.close()}>
              Hủy
            </button>
            <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="submit">
              Xác nhận
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
