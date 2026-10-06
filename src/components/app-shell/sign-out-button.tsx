"use client";

import { signOut } from "next-auth/react";

export function SignOutButton() {
  return (
    <button
      className="h-10 rounded-md border px-3 text-sm font-medium hover:bg-slate-50"
      type="button"
      onClick={() => signOut({ callbackUrl: "/login" })}
    >
      Đăng xuất
    </button>
  );
}
