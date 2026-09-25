import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { ResultadoLegado } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { mascaraCpfLista } from "@/domain/cpf";
import { intParaCompetencia, intParaData } from "@/domain/legacyDate";
import { formatarReais } from "@/domain/money";
import {
  lerNumPagamento,
  ROTULOS_SITUACAO_CONCILIACAO,
  ROTULOS_TIPO_DESCONTO,
  rotuloDominio,
  rotuloSituacaoPagamento,
  rotuloTipoPagamento,
  varianteSituacaoPagamento,
} from "@/domain/pagamento";
import { obterPagamento } from "@/server/pagamentos";
import { falhaInesperada } from "@/lib/falhas";

type Props = { params: Promise<{ num: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { num } = await params;
  return { title: `Pagamento ${lerNumPagamento(num) ?? ""}`.trim() };
}

function data(dt: number | null | undefined, vazio = "—"): string {
  if (!dt) return vazio;
  try {
    const iso = intParaData(dt);
    if (!iso) return vazio;
    const [a, m, d] = iso.split("-");
    return `${d}/${m}/${a}`;
  } catch {
    return String(dt);
  }
}

function competencia(c: number): string {
  try {
    return intParaCompetencia(c) ?? "—";
  } catch {
    return String(c);
  }
}

/** HHMMSS → `HH:MM:SS`; 0 o fuera de rango → "—". */
function hora(h: number): string {
  if (!Number.isInteger(h) || h <= 0 || h > 235959) return "—";
  const s = String(h).padStart(6, "0");
  if (Number(s.slice(2, 4)) > 59 || Number(s.slice(4, 6)) > 59) return "—";
  return `${s.slice(0, 2)}:${s.slice(2, 4)}:${s.slice(4, 6)}`;
}

const reais = (v: number | null | undefined) => (v == null ? "—" : formatarReais(v));

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

async function carregar(num: number | null) {
  try {
    return await obterPagamento(num);
  } catch (e) {
    return falhaInesperada("pagamentos", "detalhe", e);
  }
}

/** Pantalla 4.15 — detalhe do pagamento (solo lectura, ADR-009: sin editar/excluir). */
export default async function PagamentoPage({ params }: Props) {
  const { num } = await params;
  const r = await carregar(lerNumPagamento(num));

  if (!r.ok) {
    return (
      <div className="grid gap-4">
        <h1 className="text-2xl font-semibold tracking-tight">Consulta de pagamento</h1>
        <ResultadoLegado variante="erro" mensagens={[r.mensagem]}>
          <Link href="/pagamentos" className="font-medium text-primary underline underline-offset-4">
            Voltar para a lista
          </Link>
        </ResultadoLegado>
      </div>
    );
  }

  const p = r.pagamento;
  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">
          Pagamento <span className="font-mono">{p.numPagamento}</span>
        </h1>
        <Button asChild variant="outline">
          <Link href="/pagamentos">Voltar</Link>
        </Button>
      </div>

      <Card>
        <CardHeader>
          <div className="grid gap-1">
            <CardTitle>Dados do pagamento</CardTitle>
            <CardDescription>Somente leitura: pagamentos só mudam pelos processos (cálculo, descontos, correção, conciliação).</CardDescription>
          </div>
        </CardHeader>
        <CardContent>
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Item rotulo="Nº do pagamento">
              <span className="valor font-mono">{p.numPagamento}</span>
            </Item>
            {/* LGPD (NFR-04): CPF mascarado. */}
            <Item rotulo="CPF">
              <span className="valor font-mono">{mascaraCpfLista(p.numCpf)}</span>
            </Item>
            <Item rotulo="Programa">
              <span className="font-mono">{p.codPrograma}</span>
            </Item>
            <Item rotulo="Competência">
              <span className="valor">{competencia(p.anoMesRef)}</span>
            </Item>
            <Item rotulo="Situação">
              <Badge variant={varianteSituacaoPagamento(p.sitPagamento)}>{rotuloSituacaoPagamento(p.sitPagamento)}</Badge>
            </Item>
            <Item rotulo="Tipo">{rotuloTipoPagamento(p.tipoPgto)}</Item>
            <Item rotulo="Geração">
              <span className="valor">
                {[data(p.dtGeracao), hora(p.hrGeracao)].filter((x) => x !== "—").join(" ") || "—"}
              </span>
            </Item>
            <Item rotulo="Usuário">
              <span className="font-mono">{p.usrInclusao || "—"}</span>
            </Item>
            <Item rotulo="Valor bruto">
              <span className="valor">{reais(p.vlrBruto)}</span>
            </Item>
            <Item rotulo="Desconto total">
              <span className="valor">{reais(p.vlrDescontoTotal)}</span>
            </Item>
            <Item rotulo="Valor líquido">
              <span className="valor">{reais(p.vlrLiquido)}</span>
            </Item>
            <Item rotulo="Abono">
              <span className="valor">{reais(p.vlrAbono)}</span>
            </Item>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Descontos aplicados</CardTitle>
        </CardHeader>
        <CardContent>
          {p.descontos.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhum desconto aplicado.</p>
          ) : (
            <div className="rounded-lg border">
              <Table aria-label="Descontos aplicados">
                <TableHeader>
                  <TableRow>
                    <TableHead scope="col" className="text-right">
                      Ocorrência
                    </TableHead>
                    <TableHead scope="col">Tipo</TableHead>
                    <TableHead scope="col" className="text-right">
                      Valor
                    </TableHead>
                    <TableHead scope="col" className="text-right">
                      Percentual
                    </TableHead>
                    <TableHead scope="col">Processo</TableHead>
                    <TableHead scope="col">Vigência</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {p.descontos.map((d) => (
                    <TableRow key={d.occurrence}>
                      <TableCell className="valor text-right">{d.occurrence}</TableCell>
                      <TableCell>{rotuloDominio(ROTULOS_TIPO_DESCONTO, d.tipoDesconto)}</TableCell>
                      <TableCell className="valor text-right">{reais(d.vlrDesconto)}</TableCell>
                      <TableCell className="valor text-right">{d.pctDesconto.replace(".", ",")} %</TableCell>
                      <TableCell className="font-mono">{d.numProcesso || "—"}</TableCell>
                      <TableCell className="valor">
                        {data(d.dtInicioDsct)} a {data(d.dtFimDsct, "indeterminado")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Correção</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-3" aria-label="Correção">
              <Item rotulo="Valor da correção">
                <span className="valor">{reais(p.vlrCorrecao)}</span>
              </Item>
              <Item rotulo="Data da correção">
                <span className="valor">{data(p.dtCorrecao)}</span>
              </Item>
              <Item rotulo="Corrigido">{p.indCorrigido === "S" ? "S — Sim" : p.indCorrigido === "N" ? "N — Não" : (p.indCorrigido ?? "—")}</Item>
            </dl>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Conciliação</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-4 sm:grid-cols-2" aria-label="Conciliação">
              <Item rotulo="Data de pagamento">
                <span className="valor">{data(p.dtPagamento)}</span>
              </Item>
              <Item rotulo="Banco">
                <span className="font-mono">{p.codBanco || "—"}</span>
              </Item>
              <Item rotulo="Código de retorno">
                <span className="font-mono">{p.codRetornoBanco || "—"}</span>
                {p.desRetornoBanco ? <span className="ml-2 text-muted-foreground">{p.desRetornoBanco}</span> : null}
              </Item>
              <Item rotulo="Situação da conciliação">{p.sitConciliacao ? rotuloDominio(ROTULOS_SITUACAO_CONCILIACAO, p.sitConciliacao) : "—"}</Item>
              <Item rotulo="Data da conciliação">
                <span className="valor">{data(p.dtConciliacao)}</span>
              </Item>
              <Item rotulo="Valor conciliado">
                <span className="valor">{reais(p.vlrConciliado)}</span>
              </Item>
            </dl>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
