import { LoginForm } from "@/components/app-shell/login-form";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-teal-700">Restaurant SaaS</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Đăng nhập nhân viên</h1>
          <p className="mt-2 text-sm text-slate-600">
            Dùng tài khoản demo trong README sau khi chạy seed.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
