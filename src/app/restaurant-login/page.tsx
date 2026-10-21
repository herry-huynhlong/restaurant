import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { LoginForm } from "@/components/app-shell/login-form";
import { authOptions } from "@/lib/auth/options";
import { getRestaurantPostLoginPath } from "@/server/services/auth-redirect-service";

export const dynamic = "force-dynamic";

export default async function RestaurantAccountLoginPage() {
  const session = await getServerSession(authOptions);
  if (session?.user?.id) {
    const path = await getRestaurantPostLoginPath(session.user.id);
    if(path !== "/restaurant-login") redirect(path);
  }
  return <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
    <section className="w-full max-w-sm rounded-lg border bg-white p-6 shadow-sm">
      <p className="text-sm font-medium text-teal-700">QuánPilot</p>
      <h1 className="mt-2 text-2xl font-semibold">Đăng nhập nhà hàng</h1>
      <p className="mb-6 mt-2 text-sm text-slate-600">Sử dụng email và mật khẩu tài khoản hiện có. Không cần đăng ký dùng thử hoặc xác minh Google lại.</p>
      <LoginForm destination="/restaurant-entry" />
    </section>
  </main>;
}
