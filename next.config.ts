import type { NextConfig } from "next";
import { LIMITE_ARQUIVO_MB, MARGEM_MULTIPART_MB } from "./src/app/conciliacao/limite";

const nextConfig: NextConfig = {
  // ADR-007: imagen Docker multi-stage con servidor standalone.
  output: "standalone",
  // better-sqlite3 es un módulo nativo: no debe empaquetarse.
  serverExternalPackages: ["better-sqlite3", "@prisma/adapter-better-sqlite3"],
  experimental: {
    // Upload del retorno CNAB 240 (/conciliacao): LIMITE_ARQUIVO_MB (5 MB) + margen
    // para el overhead multipart. El default de Next (1 MB) rechazaría el archivo.
    serverActions: { bodySizeLimit: `${LIMITE_ARQUIVO_MB + MARGEM_MULTIPART_MB}mb` },
  },
  // H2 (LGPD): las URLs llevan la clave opaca del beneficiario (dato seudonimizado);
  // el Referer no debe llevarla a sitios de terceros.
  headers() {
    return [{ source: "/:path*", headers: [{ key: "Referrer-Policy", value: "same-origin" }] }];
  },
};

export default nextConfig;
