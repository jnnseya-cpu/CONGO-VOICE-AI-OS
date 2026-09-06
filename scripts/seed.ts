import { seed } from "@/lib/db/seed";

seed({ log: console.log })
  .then((r) => {
    console.log(r.seeded ? "Seed terminé." : "Rien à faire.");
    process.exit(0);
  })
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
