import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { buildTenantPwaMetadata, getTenantPwaBranding } from "@/server/services/tenant-pwa-service";

export async function generateMetadata({ params }: { params: { rSlug: string } }): Promise<Metadata> {
  const branding = await getTenantPwaBranding(params.rSlug);
  if (!branding) notFound();
  return buildTenantPwaMetadata(branding, "admin");
}

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return children;
}
