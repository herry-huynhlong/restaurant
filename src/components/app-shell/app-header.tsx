import type React from "react";
import { SignOutButton } from "@/components/app-shell/sign-out-button";

export function AppHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {actions}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
