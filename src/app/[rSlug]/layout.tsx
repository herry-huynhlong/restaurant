import type { Metadata } from "next";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";

export async function generateMetadata({ params }: { params: { rSlug: string } }): Promise<Metadata> {
  const restaurant = await getRestaurantBySlug(params.rSlug);
  const appName = restaurant.settings?.restaurantName?.trim() || restaurant.name;
  const latestUpdatedAt = restaurant.settings && restaurant.settings.updatedAt > restaurant.updatedAt ? restaurant.settings.updatedAt : restaurant.updatedAt;
  const logoKey = restaurant.settings?.logoUrl ?? restaurant.logoUrl ?? "default";
  const iconVersion = `${latestUpdatedAt.getTime()}-${Buffer.from(logoKey).toString("base64url").slice(0, 12)}`;

  return {
    title: appName,
    applicationName: appName,
    manifest: `/${restaurant.slug}/manifest.webmanifest`,
    icons: {
      icon: [
        { url: `/${restaurant.slug}/icons/icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png" },
        { url: `/${restaurant.slug}/icons/icon-512.png?v=${iconVersion}`, sizes: "512x512", type: "image/png" }
      ],
      apple: [{ url: `/${restaurant.slug}/icons/icon-192.png?v=${iconVersion}`, sizes: "192x192", type: "image/png" }]
    },
    appleWebApp: {
      capable: true,
      title: appName,
      statusBarStyle: "default"
    }
  };
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
