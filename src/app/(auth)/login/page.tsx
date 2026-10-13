import { LoginForm } from "@/components/app-shell/login-form";
import { productBrand } from "@/lib/brand";

export default function LoginPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <section className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
        <div className="mb-6">
          <p className="text-sm font-medium text-teal-700">{productBrand.name}</p>
          <h1 className="mt-2 text-2xl font-semibold tracking-normal">Đăng nhập hệ thống</h1>
          <p className="mt-2 text-sm text-slate-600">
            Đăng nhập bằng tài khoản quản trị hệ thống.
          </p>
        </div>
        <LoginForm />
      </section>
    </main>
  );
}
