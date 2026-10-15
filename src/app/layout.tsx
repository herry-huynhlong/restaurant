import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { SessionProvider } from "@/components/app-shell/session-provider";
import { RegisterServiceWorker } from "@/components/app-shell/register-service-worker";
import { authOptions } from "@/lib/auth/options";
import { productBrand } from "@/lib/brand";
import { getMaintenanceState } from "@/lib/maintenance-mode";
import { readRestoreJob } from "@/server/services/platform-restore-runtime";
import "./globals.css";

export const metadata: Metadata = {
  title: productBrand.name,
  description: "Phần mềm quản lý cửa hàng F&B",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const maintenance = await getMaintenanceState();
  if (maintenance) {
    const restoreJob = await readRestoreJob(maintenance.restoreJobId);
    return (
      <html lang="vi">
        <head>
          <meta httpEquiv="refresh" content="5" />
        </head>
        <body>
          <main className="flex min-h-screen items-center justify-center bg-slate-50 px-5">
            <section className="w-full max-w-lg rounded-2xl border bg-white p-8 text-center shadow-sm">
              <h1 className="text-2xl font-bold text-slate-950">Hệ thống đang bảo trì</h1>
              <p className="mt-3 leading-7 text-slate-600">
                {restoreJob?.status === "NEEDS_INTERVENTION"
                  ? "Quá trình khôi phục cần được quản trị viên kiểm tra trước khi hệ thống hoạt động trở lại."
                  : restoreJob?.publicMessage ?? "Dữ liệu đang được khôi phục an toàn. Vui lòng quay lại sau ít phút."}
              </p>
            </section>
          </main>
        </body>
      </html>
    );
  }
  const session = await getServerSession(authOptions);

  return (
    <html lang="vi">
      <body>
        <SessionProvider session={session}>
          <RegisterServiceWorker />
          {children}
        </SessionProvider>
      </body>
    </html>
  );
}
