import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";
import sharp from "sharp";
import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";

const iconSizes: Record<string, number> = {
  "icon-192.png": 192,
  "icon-512.png": 512
};

function getUploadedLogoPath(logoUrl: string | null) {
  if (!logoUrl) return null;

  const normalized = logoUrl.startsWith("/api/uploads/logos/")
    ? logoUrl.replace("/api/uploads/logos/", "")
    : logoUrl.startsWith("/uploads/logos/")
      ? logoUrl.replace("/uploads/logos/", "")
      : null;

  if (!normalized || normalized.includes("..") || normalized.includes("/") || normalized.includes("\\")) {
    return null;
  }

  return path.join(process.cwd(), "public", "uploads", "logos", normalized);
}

async function readFallbackIcon(icon: string) {
  const size = iconSizes[icon] ?? 192;
  const fallbackName = size === 512 ? "icon-512.png" : "icon-192.png";
  return readFile(path.join(process.cwd(), "public", "icons", fallbackName));
}

async function renderPwaIcon(input: Buffer, size: number) {
  return sharp(input, { failOn: "none" })
    .rotate()
    .resize({
      width: Math.round(size * 0.82),
      height: Math.round(size * 0.82),
      fit: "inside",
      withoutEnlargement: true
    })
    .extend({
      top: Math.floor(size * 0.09),
      bottom: Math.ceil(size * 0.09),
      left: Math.floor(size * 0.09),
      right: Math.ceil(size * 0.09),
      background: { r: 255, g: 255, b: 255, alpha: 1 }
    })
    .resize(size, size, { fit: "cover" })
    .png()
    .toBuffer();
}

export async function GET(_request: Request, { params }: { params: { rSlug: string; icon: string } }) {
  const size = iconSizes[params.icon];
  if (!size) {
    return new NextResponse("Not found", { status: 404 });
  }

  const restaurant = await prisma.restaurant.findUnique({
    where: { slug: params.rSlug },
    select: { logoUrl: true }
  });

  if (!restaurant) {
    return new NextResponse("Not found", { status: 404 });
  }

  let iconBuffer: Buffer;
  const logoPath = getUploadedLogoPath(restaurant.logoUrl);

  try {
    const source = logoPath ? await readFile(logoPath) : await readFallbackIcon(params.icon);
    iconBuffer = await renderPwaIcon(source, size);
  } catch {
    iconBuffer = await readFallbackIcon(params.icon);
  }

  return new NextResponse(new Uint8Array(iconBuffer), {
    headers: {
      "Content-Type": "image/png",
      "Cache-Control": "no-cache"
    }
  });
}
