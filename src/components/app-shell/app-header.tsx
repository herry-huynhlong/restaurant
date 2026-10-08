import type React from "react";
import { SignOutButton } from "@/components/app-shell/sign-out-button";
import { NotificationAudioUnlocker } from "@/components/app-shell/notification-audio-unlocker";
import { NotificationEnableButton } from "@/components/app-shell/notification-enable-button";

export function AppHeader({ title, subtitle, actions }: { title: string; subtitle?: string; actions?: React.ReactNode }) {
  return (
    <header className="border-b bg-white">
      <NotificationAudioUnlocker />
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <NotificationEnableButton />
          {actions}
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
