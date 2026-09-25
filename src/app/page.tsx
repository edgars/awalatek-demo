import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

// Página inicial. Los accesos rápidos de E2/E4 (Consulta, Novo beneficiário,
// Cálculo, Lote) se agregan cuando existan esas pantallas.
export default function Home() {
  return (
    <div className="grid gap-6">
      <h1 className="text-2xl font-semibold tracking-tight">SIFAP</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <Card>
          <CardHeader>
            <CardTitle>
              <Link href="/programas" className="hover:underline">
                Programas sociais
              </Link>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CardDescription>Inclusão e consulta de programas, faixas de cálculo e parâmetros regionais.</CardDescription>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
