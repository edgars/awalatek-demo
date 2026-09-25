"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { Competencia, CpfInput, ResultadoLegado, ResumoProcesso } from "@/components/campos";
import { formatarReais } from "@/domain/money";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { PagamentoCorrigido } from "@/server/correcao";
import { corrigirPagamentosAction } from "../actions";
import type { CampoCorrecao, EstadoCorrecao } from "../estado";

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

function competenciaTexto(comp: number): string {
  const s = String(comp).padStart(6, "0");
  return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

function TabelaCorrigidos({ corrigidos }: { corrigidos: readonly PagamentoCorrigido[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Pagamentos corrigidos</CardTitle>
      </CardHeader>
      <CardContent>
        <Table aria-label="Pagamentos corrigidos">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="text-right">
                Pagamento
              </TableHead>
              <TableHead scope="col">Competência</TableHead>
              <TableHead scope="col" className="text-right">
                Original
              </TableHead>
              <TableHead scope="col" className="text-right">
                Corrigido
              </TableHead>
              <TableHead scope="col" className="text-right">
                Diferença
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {corrigidos.map((p) => (
              <TableRow key={p.numPagamento}>
                <TableCell className="text-right font-mono tabular-nums">
                  <Link href={`/pagamentos/${p.numPagamento}`} className="text-primary underline underline-offset-4">
                    {p.numPagamento}
                  </Link>
                </TableCell>
                <TableCell className="font-mono tabular-nums">{competenciaTexto(p.competencia)}</TableCell>
                <TableCell className="valor text-right font-mono tabular-nums">{formatarReais(p.vlrOriginal)}</TableCell>
                <TableCell className="valor text-right font-mono tabular-nums">{formatarReais(p.vlrCorrigido)}</TableCell>
                <TableCell className="valor text-right font-mono tabular-nums">{formatarReais(p.vlrDiferenca)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

/** Pantalla 4.16 — entrada arriba → ação → resultado debaixo, sem sair da página. */
export function FormCorrecao() {
  const [painel, setPainel] = useState<EstadoCorrecao>(null);
  const [pendente, iniciar] = useTransition();
  const erro = (campo: CampoCorrecao) => (painel && !painel.ok && painel.campo === campo ? painel.mensagem : undefined);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      try {
        setPainel(await corrigirPagamentosAction(null, dados));
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
    });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-3" aria-label="Dados da correção">
            <CpfInput name="numCpf" label="CPF do beneficiário" required erro={erro("numCpf")} />
            <Competencia name="compIni" label="Competência inicial" required erro={erro("compIni")} />
            <Competencia name="compFim" label="Competência final" required erro={erro("compFim")} />
            <div className="flex gap-2 md:col-span-3">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Corrigindo…" : "Corrigir"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {painel && !painel.ok ? <ResultadoLegado variante="erro" mensagens={[painel.mensagem]} /> : null}
      {painel?.ok ? (
        <>
          <ResumoProcesso
            titulo={painel.mensagem}
            itens={[
              { rotulo: "REGISTROS CORRIGIDOS", valor: painel.qtdRegistros },
              { rotulo: "VALOR TOTAL CORRECAO", valor: formatarReais(painel.vlrTotal) },
            ]}
          />
          {/* CORRECAO(D9): pagos no procesados por falta de IPCA del año (solo en modo corregido). */}
          {painel.avisos && painel.avisos.length > 0 ? (
            <ResultadoLegado variante="info" titulo="Pagamentos sem índice IPCA" mensagens={painel.avisos} />
          ) : null}
          {painel.corrigidos.length > 0 ? <TabelaCorrigidos corrigidos={painel.corrigidos} /> : null}
        </>
      ) : null}
    </div>
  );
}
