import path from "node:path";
import { readFile } from "node:fs/promises";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

const contentTypes: Record<string, string> = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp"
};

const allowedFolders = new Set(["products", "logos"]);

export async function GET(_request: Request, { params }: { params: { path: string[] } }) {
  const segments = params.path ?? [];
  if (segments.length < 2 || !allowedFolders.has(segments[0])) {
    return new NextResponse("Not found", { status: 404 });
  }

  if (segments.some((segment) => !segment || segment.includes("..") || segment.includes("/") || segment.includes("\\"))) {
    return new NextResponse("Not found", { status: 404 });
  }

  const extension = path.extname(segments[segments.length - 1]).toLowerCase();
  const contentType = contentTypes[extension];
  if (!contentType) {
    return new NextResponse("Unsupported media type", { status: 415 });
  }

  const uploadsRoot = path.join(process.cwd(), "public", "uploads");
  const filePath = path.join(uploadsRoot, ...segments);
  const relativePath = path.relative(uploadsRoot, filePath);
  if (relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    return new NextResponse("Not found", { status: 404 });
  }

  try {
    const file = await readFile(filePath);
    return new NextResponse(file, {
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=31536000, immutable"
      }
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
