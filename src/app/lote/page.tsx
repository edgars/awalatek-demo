import type { Metadata } from "next";
import { connection } from "next/server";
import { intParaCompetencia } from "@/domain/legacyDate";
import { situacaoLote } from "@/server/lotePagamentos";
import { ExecucaoLote } from "./_componentes/ExecucaoLote";

export const metadata: Metadata = { title: "Lote mensal" };

/** Pantalla 4.13 — Lote mensal de pagamentos (BATCHPGT). */
export default async function LotePage() {
  // Consulta la base: solo en tiempo de request (sin prerender en `next build`).
  await connection();
  const { competencia, pagamentosExistentes, emExecucao } = await situacaoLote();
  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Lote mensal</h1>
        <p className="text-sm text-muted-foreground">
          Gera os pagamentos (situação G) da competência atual para todos os beneficiários ativos, em ordem de CPF.
        </p>
      </div>
      <ExecucaoLote
        competencia={intParaCompetencia(competencia) ?? String(competencia)}
        pagamentosExistentes={pagamentosExistentes}
        emExecucao={emExecucao}
      />
    </div>
  );
}
