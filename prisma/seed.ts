import { PrismaClient, UserRole } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const SEED_SESSION_ID = "seed-initial-v1";

const USERS = [
  {
    email: "admin@dentsis.work",
    password: "P@ssw0rd",
    name: "Admin",
    role: UserRole.ADMIN,
  },
  {
    email: "staff@dentsis.work",
    password: "P@ssw0rd",
    name: "Staff",
    role: UserRole.STAFF,
  },
];

// barcode → product definition
const PRODUCTS = [
  {
    barcode: "8850001000001",
    name: "ถุงมือยางทันตกรรม (S)",
    unit: "กล่อง",
    minStock: 5,
    isReusable: false,
  },
  {
    barcode: "8850001000002",
    name: "ถุงมือยางทันตกรรม (M)",
    unit: "กล่อง",
    minStock: 5,
    isReusable: false,
  },
  {
    barcode: "8850001000003",
    name: "ถุงมือยางทันตกรรม (L)",
    unit: "กล่อง",
    minStock: 3,
    isReusable: false,
  },
  {
    barcode: "8850001000004",
    name: "หน้ากากอนามัย 3 ชั้น",
    unit: "กล่อง",
    minStock: 10,
    isReusable: false,
  },
  {
    barcode: "8850001000005",
    name: "สำลีม้วน (Cotton Roll)",
    unit: "ถุง",
    minStock: 5,
    isReusable: false,
  },
  {
    barcode: "8850001000006",
    name: "เข็มฉีดยาชา 27G",
    unit: "กล่อง",
    minStock: 3,
    isReusable: false,
  },
  {
    barcode: "8850001000007",
    name: "ยาชา Lidocaine 2%",
    unit: "กล่อง",
    minStock: 2,
    isReusable: false,
  },
  {
    barcode: "8850001000008",
    name: "แอลกอฮอล์ 70% (500ml)",
    unit: "ขวด",
    minStock: 3,
    isReusable: false,
  },
  {
    barcode: "8850001000009",
    name: "Composite Resin A2",
    unit: "หลอด",
    minStock: 2,
    isReusable: true,
  },
  {
    barcode: "8850001000010",
    name: "Bonding Agent",
    unit: "ขวด",
    minStock: 1,
    isReusable: true,
  },
  {
    barcode: "8850001000011",
    name: "X-Ray Film Size 2",
    unit: "กล่อง",
    minStock: 2,
    isReusable: false,
  },
  {
    barcode: "8850001000012",
    name: "Impression Material Alginate",
    unit: "กระป๋อง",
    minStock: 2,
    isReusable: false,
  },
];

// Initial stock batches per barcode: [lotNumber, expireDate | null, quantity]
const INITIAL_BATCHES: Record<string, [string, Date | null, number][]> = {
  "8850001000001": [["LOT-GL-S-001", new Date("2027-06-30"), 20]],
  "8850001000002": [["LOT-GL-M-001", new Date("2027-06-30"), 30]],
  "8850001000003": [["LOT-GL-L-001", new Date("2027-06-30"), 15]],
  "8850001000004": [["LOT-MASK-001", new Date("2027-12-31"), 50]],
  "8850001000005": [["LOT-CR-001", new Date("2028-01-31"), 10]],
  "8850001000006": [["LOT-NDL-001", new Date("2026-12-31"), 10]],
  "8850001000007": [
    ["LOT-LIDO-001", new Date("2026-09-30"), 5],
    ["LOT-LIDO-002", new Date("2027-03-31"), 10],
  ],
  "8850001000008": [["LOT-ALC-001", null, 8]],
  "8850001000009": [["LOT-CR-A2-001", new Date("2027-06-30"), 3]],
  "8850001000010": [["LOT-BOND-001", new Date("2027-01-31"), 2]],
  "8850001000011": [["LOT-XRAY-001", new Date("2027-06-30"), 6]],
  "8850001000012": [["LOT-ALG-001", new Date("2026-12-31"), 4]],
};

async function seedUsers() {
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.password, 10);
    await prisma.user.upsert({
      where: { email: u.email },
      update: {},
      create: { email: u.email, passwordHash, name: u.name, role: u.role },
    });
  }
  console.log(`✓ Users: ${USERS.length} upserted`);
}

async function seedProducts() {
  const seedMovementExists = await prisma.stockMovement.findFirst({
    where: { sessionId: SEED_SESSION_ID },
  });

  for (const p of PRODUCTS) {
    const product = await prisma.product.upsert({
      where: { barcode: p.barcode },
      update: {},
      create: {
        barcode: p.barcode,
        name: p.name,
        unit: p.unit,
        minStock: p.minStock,
        isReusable: p.isReusable,
      },
    });

    const batches = INITIAL_BATCHES[p.barcode] ?? [];
    for (const [lotNumber, expireDate, quantity] of batches) {
      // Prisma upsert cannot match on null in compound unique key — use findFirst + createIfNeeded
      const existing = await prisma.stockBatch.findFirst({
        where: {
          productId: product.id,
          lotNumber,
          expireDate: expireDate ?? null,
        },
      });
      const batch =
        existing ??
        (await prisma.stockBatch.create({
          data: { productId: product.id, lotNumber, expireDate, quantity },
        }));

      if (!seedMovementExists) {
        await prisma.stockMovement.create({
          data: {
            productId: product.id,
            batchId: batch.id,
            lotNumber,
            type: "IN",
            quantity,
            sessionId: SEED_SESSION_ID,
          },
        });
      }
    }
  }

  console.log(`✓ Products: ${PRODUCTS.length} upserted with batches`);
  if (seedMovementExists) {
    console.log("  (stock movements already exist — skipped)");
  }
}

async function seedBootstrapLock() {
  // Seeding already creates the ADMIN user, so the one-time /api/auth/bootstrap
  // endpoint must be locked — otherwise anyone with ADMIN_BOOTSTRAP_SECRET could
  // still create another admin on a seeded database.
  await prisma.bootstrapLock.upsert({
    where: { id: "done" },
    update: {},
    create: { id: "done" },
  });
  console.log("✓ Bootstrap lock: set (bootstrap endpoint disabled)");
}

async function main() {
  console.log("Seeding database...");
  await seedUsers();
  await seedProducts();
  await seedBootstrapLock();
  console.log("Done.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
