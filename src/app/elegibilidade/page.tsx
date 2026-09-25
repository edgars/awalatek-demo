import type { Metadata } from "next";
import { ResultadoLegado } from "@/components/campos";
import { listarOpcoesProgramas } from "@/server/beneficiarios";
import { FormElegibilidade } from "./_componentes/FormElegibilidade";

export const metadata: Metadata = { title: "Elegibilidade" };

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

/** Programas do `Select`; em falha, lista vazia + aviso (só tipo/código no log, NFR-04). */
async function carregarProgramas(): Promise<{ programas: Awaited<ReturnType<typeof listarOpcoesProgramas>>; falhou: boolean }> {
  try {
    return { programas: await listarOpcoesProgramas(), falhou: false };
  } catch (e) {
    const nome = e instanceof Error ? e.name : "erro desconhecido";
    const codigo = (e as { code?: unknown } | null)?.code;
    console.error("[elegibilidade] lista de programas:", nome, typeof codigo === "string" ? codigo : "");
    return { programas: [], falhou: true };
  }
}

function param(v: string | string[] | undefined): string {
  return typeof v === "string" ? v : "";
}

/** Pantalla 4.11 — Elegibilidade (VALELEG): CPF + programa → ELEGÍVEL / NÃO ELEGÍVEL. */
export default async function ElegibilidadePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const { programas, falhou } = await carregarProgramas();
  // Atalho de /consulta: CPF (e programa) pré-preenchidos por query string.
  const cpf = param(sp.cpf).replace(/\D/g, "").slice(0, 11);
  const programa = param(sp.programa).trim().toUpperCase();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Elegibilidade</h1>
        <p className="text-sm text-muted-foreground">
          Verifica se o beneficiário é elegível para o programa e lista todos os motivos de recusa. Nada é gravado.
        </p>
      </div>
      {falhou ? <ResultadoLegado variante="erro" mensagens={[ERRO_INESPERADO]} /> : null}
      <FormElegibilidade programas={programas} cpfInicial={cpf} programaInicial={programas.some((p) => p.codPrograma === programa) ? programa : ""} />
    </div>
  );
}
