import type { Metadata } from "next";
import { prisma } from "@/lib/db/prisma";

export type TenantPwaContext = "customer" | "admin" | "staff" | "kitchen" | "cashier";

type TenantPwaBranding = {
  name: string;
  slug: string;
  themeColor: string;
  version: string;
};

const contextConfig: Record<TenantPwaContext, { idSuffix: string; startPath: string; manifestPath: string; description: string }> = {
  customer: {
    idSuffix: "customer",
    startPath: "welcome",
    manifestPath: "manifest.webmanifest",
    description: "ứng dụng gọi món"
  },
  admin: {
    idSuffix: "admin",
    startPath: "admin",
    manifestPath: "admin/manifest.webmanifest",
    description: "ứng dụng quản lý"
  },
  staff: {
    idSuffix: "staff",
    startPath: "staff",
    manifestPath: "staff/manifest.webmanifest",
    description: "ứng dụng nhân viên phục vụ"
  },
  kitchen: {
    idSuffix: "kitchen",
    startPath: "kitchen",
    manifestPath: "kitchen/manifest.webmanifest",
    description: "ứng dụng bếp"
  },
  cashier: {
    idSuffix: "cashier",
    startPath: "cashier",
    manifestPath: "cashier/manifest.webmanifest",
    description: "ứng dụng thu ngân"
  }
};

function shortName(name: string) {
  return name.length > 24 ? `${name.slice(0, 23).trim()}...` : name;
}

function manifestVersion(input: { updatedAt: Date; logoUrl: string | null; settings?: { updatedAt: Date; logoUrl: string | null } | null }) {
  const latestUpdatedAt = input.settings && input.settings.updatedAt > input.updatedAt ? input.settings.updatedAt : input.updatedAt;
  const logoKey = input.settings?.logoUrl ?? input.logoUrl ?? "default";
  return `${latestUpdatedAt.getTime()}-${Buffer.from(logoKey).toString("base64url").slice(0, 12)}`;
}

export async function getTenantPwaBranding(slug: string): Promise<TenantPwaBranding | null> {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug },
    select: {
      name: true,
      slug: true,
      logoUrl: true,
      updatedAt: true,
      settings: {
        select: {
          restaurantName: true,
          logoUrl: true,
          primaryColor: true,
          updatedAt: true
        }
      }
    }
  });

  if (!restaurant) return null;

  return {
    name: restaurant.settings?.restaurantName?.trim() || restaurant.name,
    slug: restaurant.slug,
    themeColor: restaurant.settings?.primaryColor || "#0f766e",
    version: manifestVersion(restaurant)
  };
}

export function buildTenantPwaManifest(branding: TenantPwaBranding, context: TenantPwaContext) {
  const config = contextConfig[context];
  const scope = `/${branding.slug}/`;
  const startUrl = `/${branding.slug}/${config.startPath}`;

  return {
    id: `${scope}pwa/${config.idSuffix}`,
    name: branding.name,
    short_name: shortName(branding.name),
    description: `${branding.name} ${config.description}`,
    start_url: startUrl,
    scope,
    display: "standalone",
    background_color: branding.themeColor,
    theme_color: branding.themeColor,
    icons: [
      { src: `/${branding.slug}/icons/icon-192.png?v=${branding.version}`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `/${branding.slug}/icons/icon-512.png?v=${branding.version}`, sizes: "512x512", type: "image/png", purpose: "any" },
      { src: `/${branding.slug}/icons/icon-512.png?v=${branding.version}`, sizes: "512x512", type: "image/png", purpose: "maskable" }
    ]
  };
}

export function buildTenantPwaMetadata(branding: TenantPwaBranding, context: TenantPwaContext): Metadata {
  const config = contextConfig[context];

  return {
    title: branding.name,
    applicationName: branding.name,
    manifest: `/${branding.slug}/${config.manifestPath}`,
    icons: {
      icon: [
        { url: `/${branding.slug}/icons/icon-192.png?v=${branding.version}`, sizes: "192x192", type: "image/png" },
        { url: `/${branding.slug}/icons/icon-512.png?v=${branding.version}`, sizes: "512x512", type: "image/png" }
      ],
      apple: [{ url: `/${branding.slug}/icons/icon-192.png?v=${branding.version}`, sizes: "192x192", type: "image/png" }]
    },
    appleWebApp: {
      capable: true,
      title: branding.name,
      statusBarStyle: "default"
    }
  };
}
