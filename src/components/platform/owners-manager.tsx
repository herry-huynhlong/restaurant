"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { resetOwnerPasswordAction, updateOwnerNameAction } from "@/app/platform/restaurants/actions";

type OwnerRow = {
  membershipId: string;
  restaurantId: string;
  restaurantName: string;
  restaurantStatus: string;
  ownerUserId: string;
  name: string;
  username: string;
  email: string;
  isActive: boolean;
};

export function PlatformOwnersManager({ owners, returnTo }: { owners: OwnerRow[]; returnTo: string }) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const filteredOwners = useMemo(() => {
    if (!normalizedQuery) return owners;
    return owners.filter((owner) => [
      owner.name,
      owner.username,
      owner.email,
      owner.restaurantName
    ].some((value) => value.toLowerCase().includes(normalizedQuery)));
  }, [normalizedQuery, owners]);

  return (
    <section className="space-y-4">
      <div className="rounded-lg border bg-white p-4 shadow-sm">
        <label className="block text-sm font-medium">
          Tìm theo tên / username / nhà hàng
          <input
            className="mt-2 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder="Nhập tên, username hoặc nhà hàng"
          />
        </label>
      </div>

      <div className="hidden overflow-auto rounded-lg border bg-white shadow-sm md:block">
        <table className="w-full min-w-[820px] border-collapse text-left text-sm">
          <thead className="bg-slate-100 text-slate-700">
            <tr>
              {["Họ tên", "Tên đăng nhập", "Nhà hàng", "Trạng thái", "Thao tác"].map((item) => (
                <th key={item} className="px-3 py-3 font-medium">{item}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredOwners.map((owner) => (
              <tr key={owner.membershipId} className="border-t align-top">
                <td className="px-3 py-3">
                  <p className="font-medium">{owner.name}</p>
                  <p className="mt-1 text-xs text-slate-500">{owner.email}</p>
                </td>
                <td className="px-3 py-3">{owner.username}</td>
                <td className="px-3 py-3">
                  <p>{owner.restaurantName}</p>
                  {owner.restaurantStatus !== "ACTIVE" ? <p className="mt-1 text-xs text-amber-700">Nhà hàng đã khóa</p> : null}
                </td>
                <td className="px-3 py-3">{owner.isActive ? "Đang hoạt động" : "Ngừng sử dụng"}</td>
                <td className="px-3 py-3">
                  <OwnerActions owner={owner} returnTo={returnTo} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filteredOwners.length === 0 ? <EmptyOwners /> : null}
      </div>

      <div className="space-y-3 md:hidden">
        {filteredOwners.map((owner) => (
          <article key={owner.membershipId} className="rounded-lg border bg-white p-4 shadow-sm">
            <p className="text-base font-semibold">{owner.name}</p>
            <p className="mt-1 text-sm text-slate-600">{owner.username}</p>
            <div className="mt-4 grid gap-2 text-sm">
              <Info label="Nhà hàng" value={owner.restaurantName} />
              <Info label="Trạng thái" value={owner.isActive ? "Đang hoạt động" : "Ngừng sử dụng"} />
              {owner.restaurantStatus !== "ACTIVE" ? <Info label="Tenant" value="Nhà hàng đã khóa" /> : null}
            </div>
            <div className="mt-4">
              <OwnerActions owner={owner} returnTo={returnTo} />
            </div>
          </article>
        ))}
        {filteredOwners.length === 0 ? <EmptyOwners /> : null}
      </div>
    </section>
  );
}

function OwnerActions({ owner, returnTo }: { owner: OwnerRow; returnTo: string }) {
  const searchParams = useSearchParams();
  const resetDialogRef = useRef<HTMLDialogElement>(null);
  const editDialogRef = useRef<HTMLDialogElement>(null);
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  useEffect(() => {
    if (!searchParams.get("success")) return;
    resetDialogRef.current?.close();
    setPassword("");
    setConfirmPassword("");
  }, [searchParams]);

  return (
    <div className="flex flex-wrap gap-2">
      <button className="rounded-md border px-2 py-1 text-sm" type="button" onClick={() => editDialogRef.current?.showModal()}>
        Sửa
      </button>
      <button className="rounded-md border px-2 py-1 text-sm" type="button" onClick={() => resetDialogRef.current?.showModal()}>
        Reset pass
      </button>

      <dialog ref={editDialogRef} className="w-full max-w-md rounded-lg border bg-white p-0 shadow-xl backdrop:bg-black/30">
        <form className="space-y-4 p-5" action={updateOwnerNameAction}>
          <input name="restaurantId" type="hidden" value={owner.restaurantId} />
          <input name="ownerUserId" type="hidden" value={owner.ownerUserId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div>
            <h2 className="text-lg font-semibold">Sửa chủ quán</h2>
            <p className="mt-1 text-sm text-slate-600">{owner.restaurantName} · {owner.username}</p>
          </div>
          <label className="block text-sm font-medium">
            Họ tên
            <input
              className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
              name="name"
              defaultValue={owner.name}
              required
            />
          </label>
          <DialogActions close={() => editDialogRef.current?.close()} submitLabel="Lưu" />
        </form>
      </dialog>

      <dialog ref={resetDialogRef} className="w-full max-w-md rounded-lg border bg-white p-0 shadow-xl backdrop:bg-black/30">
        <form className="space-y-4 p-5" action={resetOwnerPasswordAction}>
          <input name="restaurantId" type="hidden" value={owner.restaurantId} />
          <input name="ownerUserId" type="hidden" value={owner.ownerUserId} />
          <input name="returnTo" type="hidden" value={returnTo} />
          <div>
            <h2 className="text-lg font-semibold">Reset mật khẩu</h2>
            <p className="mt-1 text-sm text-slate-600">Nhà hàng: {owner.restaurantName}</p>
            <p className="mt-1 text-sm text-slate-600">Tài khoản: {owner.username}</p>
          </div>
          <label className="block text-sm font-medium">
            Mật khẩu mới
            <input
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
          <label className="block text-sm font-medium">
            Xác nhận mật khẩu
            <input
              className="mt-1 h-10 w-full rounded-md border px-3 outline-none focus:border-teal-600"
              name="confirmPassword"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
              pattern={escapePattern(password)}
              title="Xác nhận mật khẩu phải khớp."
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            />
          </label>
          <DialogActions close={() => {
            resetDialogRef.current?.close();
            setPassword("");
            setConfirmPassword("");
          }} submitLabel="Lưu mật khẩu mới" />
        </form>
      </dialog>
    </div>
  );
}

function DialogActions({ close, submitLabel }: { close: () => void; submitLabel: string }) {
  return (
    <div className="flex justify-end gap-2">
      <button className="rounded-md border px-3 py-2 text-sm" type="button" onClick={close}>
        Hủy
      </button>
      <button className="rounded-md bg-teal-700 px-3 py-2 text-sm font-semibold text-white" type="submit">
        {submitLabel}
      </button>
    </div>
  );
}

function Info({ label, value }: { label: string; value: string }) {
  return (
    <p>
      <span className="font-medium">{label}:</span> {value}
    </p>
  );
}

function EmptyOwners() {
  return <p className="rounded-lg border bg-white p-4 text-sm text-slate-500 shadow-sm">Không tìm thấy tài khoản chủ quán.</p>;
}

function escapePattern(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
