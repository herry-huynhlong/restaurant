import type { Metadata } from "next";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";

export async function generateMetadata({ params }: { params: { rSlug: string } }): Promise<Metadata> {
  const restaurant = await getRestaurantBySlug(params.rSlug);

  return {
    title: restaurant.name,
    applicationName: restaurant.name,
    manifest: `/${restaurant.slug}/manifest.webmanifest`,
    icons: {
      icon: [
        { url: `/${restaurant.slug}/icons/icon-192.png`, sizes: "192x192", type: "image/png" },
        { url: `/${restaurant.slug}/icons/icon-512.png`, sizes: "512x512", type: "image/png" }
      ],
      apple: [{ url: `/${restaurant.slug}/icons/icon-192.png`, sizes: "192x192", type: "image/png" }]
    },
    appleWebApp: {
      capable: true,
      title: restaurant.name,
      statusBarStyle: "default"
    }
  };
}

export default function TenantLayout({ children }: { children: React.ReactNode }) {
  return children;
}
