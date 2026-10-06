import { PrismaClient } from "@prisma/client";
import type { RestaurantRole } from "@prisma/client";
import bcrypt from "bcryptjs";
import crypto from "node:crypto";

const prisma = new PrismaClient();

const demoPassword = "Password123!";

async function upsertUser(email: string, name: string, platformRole: "PLATFORM_ADMIN" | "USER" = "USER") {
  const passwordHash = await bcrypt.hash(demoPassword, 12);

  return prisma.user.upsert({
    where: { email },
    update: { name, platformRole, isActive: true },
    create: { email, name, platformRole, passwordHash }
  });
}

async function main() {
  const platformAdmin = await upsertUser("platform@demo.local", "Platform Admin", "PLATFORM_ADMIN");
  const owner = await upsertUser("owner@abc.local", "ABC Owner");
  const waiter = await upsertUser("waiter@abc.local", "ABC Waiter");
  const kitchen = await upsertUser("kitchen@abc.local", "ABC Kitchen");
  const cashier = await upsertUser("cashier@abc.local", "ABC Cashier");

  const restaurant = await prisma.restaurant.upsert({
    where: { slug: "abc" },
    update: {
      name: "Quán ABC",
      status: "ACTIVE",
      plan: "BASIC",
      subscriptionStatus: "ACTIVE"
    },
    create: {
      name: "Quán ABC",
      slug: "abc",
      status: "ACTIVE",
      plan: "BASIC",
      subscriptionStatus: "ACTIVE",
      subscriptionStart: new Date()
    }
  });

  await prisma.restaurantSetting.upsert({
    where: { restaurantId: restaurant.id },
    update: {
      restaurantName: "Quán ABC",
      address: "123 Đường Demo, TP.HCM",
      phone: "0900000000"
    },
    create: {
      restaurantId: restaurant.id,
      restaurantName: "Quán ABC",
      address: "123 Đường Demo, TP.HCM",
      phone: "0900000000"
    }
  });

  const memberships: Array<[string, RestaurantRole]> = [
    [owner.id, "OWNER"],
    [waiter.id, "WAITER"],
    [kitchen.id, "KITCHEN"],
    [cashier.id, "CASHIER"]
  ];

  for (const [userId, role] of memberships) {
    await prisma.restaurantUser.upsert({
      where: { restaurantId_userId: { restaurantId: restaurant.id, userId } },
      update: { role, isActive: true },
      create: { restaurantId: restaurant.id, userId, role }
    });
  }

  await prisma.auditLog.create({
    data: {
      userId: platformAdmin.id,
      restaurantId: restaurant.id,
      action: "SEED_COMPLETED",
      entityType: "Restaurant",
      entityId: restaurant.id,
      metadataJson: { source: "prisma/seed.ts" }
    }
  });

  const areaNames = ["Khu A", "Khu B"];
  const areas = new Map<string, string>();
  for (const [index, name] of areaNames.entries()) {
    const area = await prisma.area.upsert({
      where: { id: `${restaurant.id}-${name}` },
      update: {},
      create: {
        id: `${restaurant.id}-${name}`,
        restaurantId: restaurant.id,
        name,
        sortOrder: index
      }
    });
    areas.set(name, area.id);
  }

  const tables = [
    ["A01", "Khu A"],
    ["A02", "Khu A"],
    ["A03", "Khu A"],
    ["A04", "Khu A"],
    ["B01", "Khu B"],
    ["B02", "Khu B"]
  ];

  for (const [name, areaName] of tables) {
    await prisma.restaurantTable.upsert({
      where: { restaurantId_name: { restaurantId: restaurant.id, name } },
      update: {},
      create: {
        restaurantId: restaurant.id,
        areaId: areas.get(areaName)!,
        name,
        qrToken: crypto.randomBytes(32).toString("base64url")
      }
    });
  }

  const categories = [
    { nameVi: "Khai vị", nameEn: "Appetizers" },
    { nameVi: "Món chính", nameEn: "Main dishes" },
    { nameVi: "Đồ uống", nameEn: "Drinks" }
  ];

  const categoryIds = new Map<string, string>();
  for (const [index, category] of categories.entries()) {
    const created = await prisma.category.upsert({
      where: {
        restaurantId_nameVi: {
          restaurantId: restaurant.id,
          nameVi: category.nameVi
        }
      },
      update: {
        nameEn: category.nameEn,
        sortOrder: index,
        isActive: true
      },
      create: {
        restaurantId: restaurant.id,
        nameVi: category.nameVi,
        nameEn: category.nameEn,
        sortOrder: index
      }
    });
    categoryIds.set(category.nameVi, created.id);
  }

  const products = [
    { nameVi: "Gỏi cuốn", nameEn: "Fresh spring rolls", price: 45000, category: "Khai vị" },
    { nameVi: "Bò lúc lắc", nameEn: "Shaking beef", price: 159000, category: "Món chính" },
    { nameVi: "Cơm chiên hải sản", nameEn: "Seafood fried rice", price: 89000, category: "Món chính" },
    { nameVi: "Coca Cola", nameEn: "Coca Cola", price: 25000, category: "Đồ uống" },
    { nameVi: "Trà đào", nameEn: "Peach tea", price: 35000, category: "Đồ uống" }
  ];

  await prisma.product.deleteMany({ where: { restaurantId: restaurant.id } });
  for (const [index, product] of products.entries()) {
    await prisma.product.create({
      data: {
        restaurantId: restaurant.id,
        categoryId: categoryIds.get(product.category)!,
        nameVi: product.nameVi,
        nameEn: product.nameEn,
        price: product.price,
        sortOrder: index
      }
    });
  }

  console.log("Seed completed.");
  console.table([
    ["Platform admin", "platform@demo.local", demoPassword],
    ["Owner", "owner@abc.local", demoPassword],
    ["Waiter", "waiter@abc.local", demoPassword],
    ["Kitchen", "kitchen@abc.local", demoPassword],
    ["Cashier", "cashier@abc.local", demoPassword]
  ]);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
