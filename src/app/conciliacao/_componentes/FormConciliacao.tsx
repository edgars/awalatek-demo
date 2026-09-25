"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { Campo, Competencia, ResultadoLegado, ResumoProcesso, idsCampo } from "@/components/campos";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AVISO_SEM_DETALHE, ROTULOS_RESUMO, TITULO_RESUMO } from "@/domain/cnab240";
import { formatarReais } from "@/domain/money";
import { conciliarRetornoAction } from "../actions";
import type { CampoConciliacao, EstadoConciliacao, ResumoConciliacaoTela } from "../estado";

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

function competenciaTexto(comp: number): string {
  const s = String(comp).padStart(6, "0");
  return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

function TabelaDivergencias({ linhas }: { linhas: ResumoConciliacaoTela["divergencias"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Divergências</CardTitle>
      </CardHeader>
      <CardContent>
        <Table aria-label="Divergências">
          <TableHeader>
            <TableRow>
              <TableHead scope="col" className="text-right">
                Pagamento
              </TableHead>
              <TableHead scope="col">CPF</TableHead>
              <TableHead scope="col" className="text-right">
                SIFAP
              </TableHead>
              <TableHead scope="col" className="text-right">
                Banco
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((d, i) => (
              <TableRow key={`${d.numPagamento}-${i}`}>
                <TableCell className="text-right font-mono tabular-nums">
                  <Link href={`/pagamentos/${d.numPagamento}`} className="text-primary underline underline-offset-4">
                    {d.numPagamento}
                  </Link>
                </TableCell>
                <TableCell className="valor font-mono">{d.cpf}</TableCell>
                <TableCell className="valor text-right font-mono tabular-nums">{formatarReais(d.vlrSifap)}</TableCell>
                <TableCell className="valor text-right font-mono tabular-nums">{formatarReais(d.vlrBanco)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function TabelaNaoEncontrados({ linhas }: { linhas: ResumoConciliacaoTela["listaNaoEncontrados"] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Não encontrados</CardTitle>
      </CardHeader>
      <CardContent>
        <Table aria-label="Não encontrados">
          <TableHeader>
            <TableRow>
              <TableHead scope="col">CPF</TableHead>
              <TableHead scope="col">Documento</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((n, i) => (
              <TableRow key={`${n.documento}-${i}`}>
                <TableCell className="valor font-mono">{n.cpf}</TableCell>
                <TableCell className="valor font-mono tabular-nums">{n.documento}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Resultado({ resumo }: { resumo: ResumoConciliacaoTela }) {
  return (
    <>
      {resumo.detalhes === 0 ? (
        <Alert role="status" data-testid="aviso-conciliacao">
          <AlertTitle>Nenhum pagamento conciliado</AlertTitle>
          <AlertDescription>{AVISO_SEM_DETALHE}</AlertDescription>
        </Alert>
      ) : null}
      <ResumoProcesso
        titulo={TITULO_RESUMO}
        itens={[
          { rotulo: "COMPETENCIA", valor: competenciaTexto(resumo.competencia) },
          { rotulo: ROTULOS_RESUMO.lidos, valor: resumo.lidos },
          { rotulo: ROTULOS_RESUMO.conciliados, valor: resumo.conciliados },
          { rotulo: ROTULOS_RESUMO.divergentes, valor: resumo.divergentes },
          { rotulo: ROTULOS_RESUMO.naoEncontrados, valor: resumo.naoEncontrados },
          { rotulo: ROTULOS_RESUMO.auditoria, valor: resumo.auditoria },
        ]}
      />
      {resumo.avisos.length > 0 ? <ResultadoLegado variante="info" titulo="Códigos de retorno desconhecidos" mensagens={resumo.avisos} /> : null}
      {resumo.divergencias.length > 0 ? <TabelaDivergencias linhas={resumo.divergencias} /> : null}
      {resumo.listaNaoEncontrados.length > 0 ? <TabelaNaoEncontrados linhas={resumo.listaNaoEncontrados} /> : null}
    </>
  );
}

/** Campo de upload do arquivo de retorno (substitui "ARQUIVO RETORNO" do legado). */
function ArquivoRetorno({ erro }: { erro?: string }) {
  const p = { name: "arquivo", label: "Arquivo de retorno", required: true, erro, descricao: "CNAB 240 (.ret ou .txt), até 5 MB." };
  const { id, describedBy } = idsCampo(p);
  return (
    <Campo {...p}>
      <Input id={id} name="arquivo" type="file" accept=".ret,.txt,text/plain" required aria-invalid={erro ? true : undefined} aria-describedby={describedBy} />
    </Campo>
  );
}

/**
 * Pantalla 4.17 — competência + arquivo → "Conciliar" com confirmação na própria
 * página → resumo, divergências e não encontrados, sem sair da página.
 */
export function FormConciliacao() {
  const [painel, setPainel] = useState<EstadoConciliacao>(null);
  const [confirmando, setConfirmando] = useState<{ dados: FormData; competencia: string } | null>(null);
  const [pendente, iniciar] = useTransition();
  const erro = (campo: CampoConciliacao) => (painel && !painel.ok && painel.campo === campo ? painel.mensagem : undefined);

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (pendente) return;
    const dados = new FormData(e.currentTarget);
    const comp = String(dados.get("competencia") ?? "");
    setConfirmando({ dados, competencia: /^\d{6}$/.test(comp) ? competenciaTexto(Number(comp)) : comp });
  };

  const executar = () => {
    if (!confirmando) return;
    const { dados } = confirmando;
    setConfirmando(null);
    setPainel(null);
    iniciar(async () => {
      try {
        setPainel(await conciliarRetornoAction(null, dados));
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
    });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent className="grid gap-4">
          <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Dados da conciliação">
            <Competencia name="competencia" label="Competência" required erro={erro("competencia")} />
            <ArquivoRetorno erro={erro("arquivo")} />
            {confirmando ? null : (
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={pendente}>
                  {pendente ? "Conciliando…" : "Conciliar"}
                </Button>
              </div>
            )}
          </form>
          {confirmando ? (
            <div role="alertdialog" aria-labelledby="confirmacao-conciliacao" className="grid gap-3 rounded-md border border-warning/60 bg-warning/15 p-3">
              <p id="confirmacao-conciliacao" className="text-sm font-medium">
                Conciliar o arquivo de retorno com os pagamentos da competência {confirmando.competencia}? A situação dos
                pagamentos será atualizada e a auditoria registrada.
              </p>
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={executar}>
                  Confirmar
                </Button>
                <Button type="button" variant="outline" onClick={() => setConfirmando(null)}>
                  Cancelar
                </Button>
              </div>
            </div>
          ) : null}
          {pendente ? (
            <p role="status" className="text-sm text-muted-foreground">
              Processando o arquivo de retorno…
            </p>
          ) : null}
        </CardContent>
      </Card>

      {painel && !painel.ok ? <ResultadoLegado variante="erro" mensagens={[painel.mensagem]} /> : null}
      {painel?.ok ? <Resultado resumo={painel.resumo} /> : null}
    </div>
  );
}
