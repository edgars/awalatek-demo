import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // ADR-007: imagen Docker multi-stage con servidor standalone.
  output: "standalone",
  // better-sqlite3 es un módulo nativo: no debe empaquetarse.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  experimental: {
    // Upload del retorno CNAB 240 (/conciliacao): hasta 5 MB + overhead multipart.
    serverActions: { bodySizeLimit: "6mb" },
  },
};

export default nextConfig;
