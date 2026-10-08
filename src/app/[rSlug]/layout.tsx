import type { Metadata } from "next";
import { getRestaurantBySlug } from "@/lib/tenant/restaurant";

export async function generateMetadata({ params }: { params: { rSlug: string } }): Promise<Metadata> {
  const restaurant = await getRestaurantBySlug(params.rSlug);

  return {
    title: restaurant.name,
    applicationName: restaurant.name,
    manifest: `/${restaurant.slug}/manifest.webmanifest`,
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
