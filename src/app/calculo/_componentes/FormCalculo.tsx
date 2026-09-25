"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { Competencia, CpfInput, ResultadoLegado, ResumoProcesso, type ItemResumo } from "@/components/campos";
import { centavosParaTexto } from "@/components/campos/conversao";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { mascaraCpfLista } from "@/domain/cpf";
import type { ResumoCalculo } from "@/server/calculo";
import { calcularBeneficioAction } from "../actions";
import type { CampoCalculo, EstadoCalculo } from "../estado";

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";
const ROTULO_TIPO: Record<string, string> = { N: "Normal", D: "Dezembro (13º e abono)" };

const reais = (centavos: number) => `R$ ${centavosParaTexto(centavos)}`;

function competenciaTexto(comp: number): string {
  const s = String(comp).padStart(6, "0");
  return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/** Rótulos del resumen de CALCBENF (literales del legado, sin el relleno de puntos). */
function itensResumo(r: ResumoCalculo): ItemResumo[] {
  const itens: ItemResumo[] = [
    { rotulo: "CPF", valor: mascaraCpfLista(r.numCpf) },
    { rotulo: "COMPETENCIA", valor: competenciaTexto(r.competencia) },
    { rotulo: "VLR BRUTO", valor: reais(r.vlrBruto) },
    { rotulo: "VLR DESCONTO", valor: reais(r.vlrDesconto) },
    { rotulo: "VLR LIQUIDO", valor: reais(r.vlrLiquido) },
    { rotulo: "TIPO PGTO", valor: `${r.tipoPgto} — ${ROTULO_TIPO[r.tipoPgto] ?? r.tipoPgto}` },
  ];
  // RK-46191b29bce5 (CALCBENF:297): em dezembro o resumo mostra também 13º e abono.
  if (r.tipoPgto === "D") {
    itens.push({ rotulo: "VLR 13O SALARIO", valor: reais(r.vlr13) }, { rotulo: "VLR ABONO", valor: reais(r.vlrAbono) });
  }
  return itens;
}

/** Pantalla 4.12 — entrada arriba → ação → resultado debaixo, sem sair da página. */
export function FormCalculo() {
  const [painel, setPainel] = useState<EstadoCalculo>(null);
  const [pendente, iniciar] = useTransition();
  const erro = (campo: CampoCalculo) => (painel && !painel.ok && painel.campo === campo ? painel.mensagem : undefined);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      try {
        setPainel(await calcularBeneficioAction(null, dados));
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
    });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Dados do cálculo">
            <CpfInput name="numCpf" label="CPF do beneficiário" required erro={erro("numCpf")} />
            <Competencia name="competencia" label="Competência" required erro={erro("competencia")} />
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Calculando…" : "Calcular"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {painel && !painel.ok ? <ResultadoLegado variante="erro" mensagens={[painel.mensagem]} /> : null}
      {painel?.ok ? (
        <ResumoProcesso titulo={painel.mensagem} itens={itensResumo(painel.resumo)}>
          <Link href={`/pagamentos/${painel.resumo.numPagamento}`} className="font-medium text-primary underline underline-offset-4">
            Pagamento nº {painel.resumo.numPagamento}
          </Link>
        </ResumoProcesso>
      ) : null}
    </div>
  );
}
