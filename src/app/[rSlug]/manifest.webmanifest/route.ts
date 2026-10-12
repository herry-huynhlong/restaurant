import { NextResponse } from "next/server";
import { prisma } from "@/lib/db/prisma";

function shortName(name: string) {
  return name.length > 24 ? `${name.slice(0, 23).trim()}…` : name;
}

function manifestVersion(input: { updatedAt: Date; logoUrl: string | null; settings?: { updatedAt: Date; logoUrl: string | null } | null }) {
  const latestUpdatedAt = input.settings && input.settings.updatedAt > input.updatedAt ? input.settings.updatedAt : input.updatedAt;
  const logoKey = input.settings?.logoUrl ?? input.logoUrl ?? "default";
  return `${latestUpdatedAt.getTime()}-${Buffer.from(logoKey).toString("base64url").slice(0, 12)}`;
}

export async function GET(_request: Request, { params }: { params: { rSlug: string } }) {
  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.rSlug },
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

  if (!restaurant) {
    return NextResponse.json({ error: "Restaurant not found" }, { status: 404 });
  }

  const scope = `/${restaurant.slug}/`;
  const appName = restaurant.settings?.restaurantName?.trim() || restaurant.name;
  const themeColor = restaurant.settings?.primaryColor || "#0f766e";
  const version = manifestVersion(restaurant);

  return NextResponse.json(
    {
      id: scope,
      name: appName,
      short_name: shortName(appName),
      description: `${appName} ordering app`,
      start_url: scope,
      scope,
      display: "standalone",
      background_color: themeColor,
      theme_color: themeColor,
      icons: [
        { src: `/${restaurant.slug}/icons/icon-192.png?v=${version}`, sizes: "192x192", type: "image/png", purpose: "any" },
        { src: `/${restaurant.slug}/icons/icon-512.png?v=${version}`, sizes: "512x512", type: "image/png", purpose: "any" },
        { src: `/${restaurant.slug}/icons/icon-512.png?v=${version}`, sizes: "512x512", type: "image/png", purpose: "maskable" }
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
