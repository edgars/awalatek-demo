"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { Campo, CpfInput, idsCampo, ResultadoLegado, ResumoProcesso, type ItemResumo } from "@/components/campos";
import { centavosParaTexto, fatorParaTexto } from "@/components/campos/conversao";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mascaraCpfLista } from "@/domain/cpf";
import type { DescontoResumo, ResumoDescontos, SituacaoDesconto } from "@/server/descontos";
import { recalcularDescontosAction } from "../actions";
import type { CampoDescontos, EstadoDescontos } from "../estado";

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";
const AVISO_D13 = "O valor líquido não é recalculado (regra legada D13)";

const ROTULO_TIPO: Record<string, string> = {
  J: "Judicial",
  P: "Pensão alimentícia",
  A: "Administrativo",
  I: "Imposto retido",
  S: "Sindical",
  C: "Contribuição",
};

const SITUACAO: Record<SituacaoDesconto, { texto: string; variante: "success" | "secondary" | "outline" }> = {
  aplicado: { texto: "Aplicado", variante: "success" },
  ignorado: { texto: "Ignorado (tipo)", variante: "outline" },
  foraDeVigencia: { texto: "Fora de vigência", variante: "secondary" },
};

const reais = (centavos: number) => `R$ ${centavosParaTexto(centavos)}`;

function competenciaTexto(comp: number): string {
  const s = String(comp).padStart(6, "0");
  return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

function dataTexto(dt: number): string {
  if (!dt) return "—";
  const s = String(dt).padStart(8, "0");
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/** Rótulos del WRITE final de CALCDSCT (literales, sin el relleno de puntos) + contexto del pago. */
function itensResumo(r: ResumoDescontos): ItemResumo[] {
  return [
    { rotulo: "CPF", valor: mascaraCpfLista(r.numCpf) },
    { rotulo: "COMPETENCIA", valor: competenciaTexto(r.competencia) },
    { rotulo: "VLR BRUTO", valor: reais(r.vlrBruto) },
    { rotulo: "VLR DESCONTO", valor: reais(r.vlrDesconto) },
    { rotulo: "TETO 30%", valor: reais(r.vlrTeto) },
    { rotulo: "CONTRIBUICAO SOCIAL", valor: reais(r.vlrContribuicao) },
  ];
}

function TabelaDescontos({ descontos }: { descontos: readonly DescontoResumo[] }) {
  if (descontos.length === 0) {
    return <p className="text-muted-foreground">Beneficiário sem descontos registrados: apenas a contribuição social.</p>;
  }
  return (
    <div className="overflow-x-auto">
      <Table aria-label="Descontos processados">
        <TableHeader>
          <TableRow>
            <TableHead>#</TableHead>
            <TableHead>Tipo</TableHead>
            <TableHead className="text-right">Valor aplicado</TableHead>
            <TableHead className="text-right">%</TableHead>
            <TableHead>Início</TableHead>
            <TableHead>Fim</TableHead>
            <TableHead>Processo</TableHead>
            <TableHead>Situação</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {descontos.map((d) => (
            <TableRow key={d.occurrence} data-testid={`desconto-${d.occurrence}`}>
              <TableCell className="valor">{d.occurrence}</TableCell>
              <TableCell>
                <span className="font-mono">{d.tipoDesconto}</span> — {ROTULO_TIPO[d.tipoDesconto] ?? "Desconhecido"}
              </TableCell>
              <TableCell className="valor text-right">{d.situacao === "aplicado" ? reais(d.vlrItem) : "—"}</TableCell>
              <TableCell className="valor text-right">{fatorParaTexto(d.pctDesconto)}</TableCell>
              <TableCell className="valor">{dataTexto(d.dtInicioDsct)}</TableCell>
              <TableCell className="valor">{dataTexto(d.dtFimDsct)}</TableCell>
              <TableCell className="font-mono">{d.numProcesso || "—"}</TableCell>
              <TableCell>
                <Badge variant={SITUACAO[d.situacao].variante}>{SITUACAO[d.situacao].texto}</Badge>
                {d.tetoAplicado ? <span className="ml-2 text-xs text-muted-foreground">teto 30% aplicado</span> : null}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Pantalla 4.14 — entrada arriba → ação → resultado debaixo, sem sair da página. */
export function FormDescontos() {
  const [painel, setPainel] = useState<EstadoDescontos>(null);
  const [pendente, iniciar] = useTransition();
  const erro = (campo: CampoDescontos) => (painel && !painel.ok && painel.campo === campo ? painel.mensagem : undefined);
  const campoNum = { name: "numPagamento", label: "Nº do pagamento", required: true, erro: erro("numPagamento") };
  const idsNum = idsCampo(campoNum);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      try {
        setPainel(await recalcularDescontosAction(null, dados));
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
    });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Dados do recálculo">
            <CpfInput name="numCpf" label="CPF do beneficiário" required erro={erro("numCpf")} />
            <Campo {...campoNum}>
              <Input
                id={idsNum.id}
                name="numPagamento"
                inputMode="numeric"
                autoComplete="off"
                className="valor font-mono"
                maxLength={10}
                required
                aria-invalid={campoNum.erro ? true : undefined}
                aria-describedby={idsNum.describedBy}
              />
            </Campo>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Calculando…" : "Calcular descontos"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {painel && !painel.ok ? <ResultadoLegado variante="erro" mensagens={[painel.mensagem]} /> : null}
      {painel?.ok ? (
        <>
          <ResumoProcesso titulo={painel.mensagem} itens={itensResumo(painel.resumo)}>
            <div className="grid gap-3">
              <TabelaDescontos descontos={painel.resumo.descontos} />
              <Link href={`/pagamentos/${painel.resumo.numPagamento}`} className="font-medium text-primary underline underline-offset-4">
                Pagamento nº {painel.resumo.numPagamento}
              </Link>
            </div>
          </ResumoProcesso>
          <Alert variant="warning" data-testid="aviso-d13">
            <AlertTitle>Atenção</AlertTitle>
            <AlertDescription>
              {AVISO_D13}. Valor líquido do pagamento: {reais(painel.resumo.vlrLiquido)}.
            </AlertDescription>
          </Alert>
        </>
      ) : null}
    </div>
  );
}
