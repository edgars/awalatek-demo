import "dotenv/config";
import { defineConfig } from "prisma/config";

// Prisma 7: la URL de la base se configura aquí (no en schema.prisma) y
// `.env` no se carga automáticamente, por eso el import de dotenv.
export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
  datasource: {
    // Opcional para `prisma generate` (postinstall sin .env); requerido por migrate.
    url: process.env.DATABASE_URL,
  },
});
