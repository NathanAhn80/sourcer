import { PrismaClient } from "@prisma/client";
import { randomBytes } from "crypto";

const prisma = new PrismaClient();

async function main() {
  const apiKey = `sk_${randomBytes(16).toString("hex")}`;
  const user = await prisma.user.upsert({
    where: { email: "demo@sourcer.local" },
    update: {},
    create: {
      email: "demo@sourcer.local",
      apiKey,
    },
  });

  console.log("Demo user ready");
  console.log(`  email:  ${user.email}`);
  console.log(`  apiKey: ${user.apiKey}`);
  console.log("Paste this apiKey into the Chrome extension popup.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
