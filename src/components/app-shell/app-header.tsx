import { SignOutButton } from "@/components/app-shell/sign-out-button";

export function AppHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between gap-4 px-4 py-4">
        <div>
          <h1 className="text-xl font-semibold">{title}</h1>
          {subtitle ? <p className="mt-1 text-sm text-slate-600">{subtitle}</p> : null}
        </div>
        <SignOutButton />
      </div>
    </header>
  );
}
