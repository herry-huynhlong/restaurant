import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
      <section className="w-full max-w-md rounded-lg border bg-white p-6 shadow-sm">
        <p className="text-sm font-medium text-red-700">403</p>
        <h1 className="mt-2 text-2xl font-semibold">Không có quyền truy cập</h1>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          Tài khoản của bạn không có quyền mở khu vực này. Hãy đăng nhập bằng đúng vai trò
          hoặc quay lại trang phù hợp.
        </p>
        <Link className="mt-5 inline-flex rounded-md bg-teal-700 px-4 py-2 text-sm font-semibold text-white" href="/post-login">
          Về trang của tôi
        </Link>
      </section>
    </main>
  );
}
