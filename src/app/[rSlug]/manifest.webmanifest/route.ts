import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

function shortName(name: string) {
  return name.length > 24 ? `${name.slice(0, 23).trim()}…` : name;
}

export async function GET(_request: Request, { params }: { params: { rSlug: string } }) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.rSlug },
    select: {
      name: true,
      slug: true,
      settings: {
        select: {
          primaryColor: true
        }
      }
    }
  });

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const scope = `/${restaurant.slug}/`;
  const themeColor = restaurant.settings?.primaryColor || "#0f766e";

  return NextResponse.json(
    {
      id: scope,
      name: restaurant.name,
      short_name: shortName(restaurant.name),
      description: `${restaurant.name} ordering app`,
      start_url: scope,
      scope,
      display: "standalone",
      background_color: themeColor,
      theme_color: themeColor,
      icons: [
        { src: `/${restaurant.slug}/icons/icon-192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `/${restaurant.slug}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `/${restaurant.slug}/icons/icon-512.png`, sizes: "512x512", type: "image/png", purpose: "maskable" }
      ]
    },
    {
      headers: {
        "Cache-Control": "no-cache",
        "Content-Type": "application/manifest+json; charset=utf-8"
      }
    }
  );
}
