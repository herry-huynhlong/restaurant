import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { SessionProvider } from "@/components/app-shell/session-provider";
import { RegisterServiceWorker } from "@/components/app-shell/register-service-worker";
import { authOptions } from "@/lib/auth/options";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restaurant SaaS",
  description: "Multi-tenant restaurant ordering SaaS",
  icons: {
    icon: [
      { url: "/favicon.png", sizes: "32x32", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }]
  }
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
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
