import type { Metadata } from "next";
import { getServerSession } from "next-auth";
import { notFound } from "next/navigation";
import { authOptions } from "@/lib/auth/options";
import { prisma } from "@/lib/db/prisma";
import { staffPwaContext } from "@/lib/tenant-pwa";
import { buildTenantPwaMetadata, getTenantPwaBranding } from "@/server/services/tenant-pwa-service";

export async function generateMetadata({ params }: { params: { rSlug: string } }): Promise<Metadata> {
  const branding = await getTenantPwaBranding(params.rSlug);
  if (!branding) notFound();
  const session = await getServerSession(authOptions);
  const membership = session?.user?.id ? await prisma.restaurantUser.findFirst({
    where: { userId: session.user.id, restaurant: { slug: params.rSlug }, isActive: true, deletedAt: null },
    select: { role: true }
  }) : null;
  return buildTenantPwaMetadata(branding, staffPwaContext(membership?.role));
}

export default function DeviceSetupLayout({ children }: { children: React.ReactNode }) {
  return children;
}
