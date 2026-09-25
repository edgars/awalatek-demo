"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { ResultadoLegado, ResumoProcesso, type ItemResumo } from "@/components/campos";
import { centavosParaTexto } from "@/components/campos/conversao";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { competenciaJaProcessada, type ResumoLote } from "@/domain/calculo/lote";
import { executarLoteAction } from "../actions";
import type { EstadoLote } from "../estado";

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

const reais = (centavos: number) => `R$ ${centavosParaTexto(centavos)}`;

function competenciaTexto(comp: number): string {
  const s = String(comp).padStart(6, "0");
  return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/** Rótulos do resumo final de BATCHPGT (literais do legado, sem o preenchimento de pontos). */
function itensResumo(r: ResumoLote): ItemResumo[] {
  return [
    { rotulo: "COMPETENCIA", valor: competenciaTexto(r.competencia) },
    { rotulo: "TOTAL PROCESSADOS", valor: r.processados },
    { rotulo: "PAGTOS GERADOS", valor: r.gerados },
    { rotulo: "IGNORADOS", valor: r.ignorados },
    { rotulo: "ERROS", valor: r.erros },
    { rotulo: "VLR TOTAL BRUTO", valor: reais(r.vlrTotalBruto) },
    { rotulo: "VLR TOTAL DESC", valor: reais(r.vlrTotalDesconto) },
    { rotulo: "VLR TOTAL LIQUIDO", valor: reais(r.vlrTotalLiquido) },
    { rotulo: "VLR TOTAL ABONO", valor: reais(r.vlrTotalAbono) },
  ];
}

/**
 * Pantalla 4.13 — competência atual + pagamentos existentes → "Executar lote" com
 * confirmação na própria página → resumo e lista de erros, sem sair da página.
 */
export function ExecucaoLote({
  competencia,
  pagamentosExistentes,
  emExecucao,
}: {
  /** Competência AAAA-MM. */
  competencia: string;
  pagamentosExistentes: number;
  emExecucao: boolean;
}) {
  const router = useRouter();
  const [confirmando, setConfirmando] = useState(false);
  const [painel, setPainel] = useState<EstadoLote>(null);
  const [pendente, iniciar] = useTransition();

  const executar = () => {
    setConfirmando(false);
    setPainel(null);
    iniciar(async () => {
      try {
        setPainel(await executarLoteAction());
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
      router.refresh(); // atualiza a contagem de pagamentos da competência
    });
  };

  const resumo = painel?.resumo ?? null;
  const jaProcessado = painel?.ok === true && competenciaJaProcessada(painel.resumo);

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4">
          <dl className="grid grid-cols-[max-content_1fr] gap-x-6 gap-y-1 text-sm">
            <dt className="text-muted-foreground">Competência a processar</dt>
            <dd className="valor font-mono tabular-nums" data-testid="competencia-lote">
              {competencia}
            </dd>
            <dt className="text-muted-foreground">Pagamentos já existentes na competência</dt>
            <dd className="valor font-mono tabular-nums" data-testid="pagamentos-existentes">
              {pagamentosExistentes}
            </dd>
          </dl>

          {confirmando ? (
            <div role="alertdialog" aria-labelledby="confirmacao-lote" className="grid gap-3 rounded-md border border-warning/60 bg-warning/15 p-3">
              <p id="confirmacao-lote" className="text-sm font-medium">
                Gerar pagamentos da competência {competencia} para todos os beneficiários ativos?
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={executar}>
                  Confirmar
                </Button>
                <Button type="button" variant="outline" onClick={() => setConfirmando(false)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button type="button" onClick={() => setConfirmando(true)} disabled={pendente || emExecucao}>
                {pendente ? "Executando lote…" : "Executar lote"}
              </Button>
            </div>
          )}
          {emExecucao && !pendente ? <p className="text-sm text-muted-foreground">Lote já em execução.</p> : null}
        </CardContent>
      </Card>

      {painel && !painel.ok ? <ResultadoLegado variante="erro" mensagens={[painel.mensagem]} /> : null}
      {resumo ? (
        <>
          {jaProcessado ? (
            <Alert role="status" data-testid="aviso-lote">
              <AlertTitle>Nenhum pagamento gerado</AlertTitle>
              <AlertDescription>
                A competência {competenciaTexto(resumo.competencia)} já foi processada: {resumo.ignoradosPorMotivo.JA_GERADO}{" "}
                beneficiário(s) já tinham pagamento nela e nenhum pagamento foi duplicado.
              </AlertDescription>
            </Alert>
          ) : null}
          <ResumoProcesso titulo={painel?.ok ? "BATCHPGT - RESUMO PROCESSAMENTO" : "BATCHPGT - RESUMO PARCIAL"} itens={itensResumo(resumo)} />
          {resumo.mensagensErro.length > 0 ? (
            <ResultadoLegado variante="erro" titulo="Erros do lote" mensagens={resumo.mensagensErro} />
          ) : null}
          {/* CORRECAO(D17): pagamentos gerados com valor zero (só em modo corrigido). */}
          {resumo.avisosBeneficioZero?.length ? (
            <ResultadoLegado
              variante="info"
              titulo={`Benefícios com valor zero (${resumo.beneficiosZero})`}
              mensagens={resumo.avisosBeneficioZero}
            />
          ) : null}
        </>
      ) : null}
    </div>
  );
}
