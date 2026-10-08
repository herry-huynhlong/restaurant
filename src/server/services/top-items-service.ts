import { prisma } from "@/lib/db/prisma";
import { servedUploadUrl } from "@/lib/upload-url";
import { getPeriodRange, type ReportPeriod } from "@/lib/period";

export type TopItemsPeriod = Extract<ReportPeriod, "today" | "week" | "month">;

export type TopMenuItem = {
  rank: number;
  productId: string;
  name: string;
  imageUrl: string | null;
  quantity: number;
  revenue: number;
};

export function normalizeTopItemsPeriod(value?: string | null): TopItemsPeriod {
  return value === "week" || value === "month" ? value : "today";
}

export async function getRestaurantTopItems(restaurantId: string, period: TopItemsPeriod) {
  const settings = await prisma.restaurantSetting.findUnique({ where: { restaurantId } });
  const timeZone = settings?.timezone ?? "Asia/Ho_Chi_Minh";
  const { start, end } = getPeriodRange(period, timeZone);

  const groupedItems = await prisma.orderItem.groupBy({
    by: ["productId"],
    where: {
      restaurantId,
      order: {
        createdAt: { gte: start, lt: end }
      }
    },
    _sum: {
      quantity: true,
      subtotal: true
    },
    orderBy: [
      { _sum: { quantity: "desc" } },
      { _sum: { subtotal: "desc" } }
    ],
    take: 10
  });

  const productIds = groupedItems.map((item) => item.productId);
  const [products, latestSnapshots] = await Promise.all([
    prisma.product.findMany({
      where: { restaurantId, id: { in: productIds } },
      select: { id: true, nameVi: true, imageUrl: true }
    }),
    prisma.orderItem.findMany({
      where: {
        restaurantId,
        productId: { in: productIds },
        order: {
          createdAt: { gte: start, lt: end }
        }
      },
      distinct: ["productId"],
      orderBy: [
        { productId: "asc" },
        { createdAt: "desc" }
      ],
      select: { productId: true, productNameViSnapshot: true }
    })
  ]);

  const productMap = new Map(products.map((product) => [product.id, product]));
  const snapshotMap = new Map(latestSnapshots.map((item) => [item.productId, item.productNameViSnapshot]));

  return {
    period,
    timeZone,
    range: { start, end },
    items: groupedItems.map<TopMenuItem>((item, index) => {
      const product = productMap.get(item.productId);
      return {
        rank: index + 1,
        productId: item.productId,
        name: snapshotMap.get(item.productId) ?? product?.nameVi ?? "Món đã xóa",
        imageUrl: servedUploadUrl(product?.imageUrl ?? null),
        quantity: item._sum.quantity ?? 0,
        revenue: item._sum.subtotal ?? 0
      };
    })
  };
}
