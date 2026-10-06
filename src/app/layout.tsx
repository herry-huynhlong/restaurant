import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { SessionProvider } from "@/components/app-shell/session-provider";
import { authOptions } from "@/lib/auth/options";
import "./globals.css";

export const metadata: Metadata = {
  title: "Restaurant SaaS",
  description: "Multi-tenant restaurant ordering SaaS"
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getServerSession(authOptions);

  return (
    <html lang="vi">
      <body>
        <SessionProvider session={session}>{children}</SessionProvider>
      </body>
    </html>
  );
}
