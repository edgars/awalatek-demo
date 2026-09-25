"use client";

import { useState, useTransition, type FormEvent, type ReactNode } from "react";
import { CpfInput, NisInput, ResultadoLegado } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { tituloHistorico, type FichaConsulta, type Historico, type TipoBusca } from "@/domain/beneficiario/consulta";
import { formatarReais } from "@/domain/money";
import { consultarBeneficiarioAction } from "../actions";
import type { EstadoConsulta } from "../estado";
import { ERRO_INESPERADO } from "@/lib/falhas";

const VARIANTE_SITUACAO: Record<string, "success" | "warning" | "secondary" | "destructive"> = {
  A: "success",
  S: "warning",
  C: "destructive",
  I: "secondary",
  D: "secondary",
};

function dataTexto(dt: number): string {
  const s = String(dt);
  if (!dt || !/^\d{8}$/.test(s)) return "—";
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

function competenciaTexto(comp: number): string {
  const s = String(comp);
  if (!comp || !/^\d{6}$/.test(s)) return "—";
  return `${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

function cepTexto(cep: number | null): string {
  if (!cep) return "—";
  const s = String(cep).padStart(8, "0");
  return `${s.slice(0, 5)}-${s.slice(5)}`;
}

function Item({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground">{rotulo}</dt>
      <dd className="text-sm font-medium">{children}</dd>
    </div>
  );
}

function Ficha({ f }: { f: FichaConsulta }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Dados do beneficiário</CardTitle>
      </CardHeader>
      <CardContent>
        <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3" aria-label="Dados do beneficiário">
          <Item rotulo="CPF">
            {/* LGPD (NFR-04): só a máscara de CONSBENF (LEGACY-QUIRK D7). */}
            <span className="valor font-mono" data-testid="cpf-mascarado">
              {f.cpfMascarado}
            </span>
          </Item>
          <Item rotulo="Nome">{f.nomeCompleto}</Item>
          <Item rotulo="Data de nascimento">{dataTexto(f.dtNascimento)}</Item>
          <Item rotulo="Sexo">{f.sexo}</Item>
          <Item rotulo="Endereço">{f.logradouro || "—"}</Item>
          <Item rotulo="Município/UF">
            {f.municipio || "—"}/{f.uf || "—"}
          </Item>
          <Item rotulo="CEP">
            <span className="valor font-mono">{cepTexto(f.cep)}</span>
          </Item>
          <Item rotulo="Situação">
            <Badge variant={VARIANTE_SITUACAO[f.sitBeneficiario] ?? "secondary"} data-testid="situacao">
              {f.sitBeneficiario} - {f.statusDescricao}
            </Badge>
          </Item>
          <Item rotulo="Programa">
            <span className="font-mono">{f.codPrograma}</span>
          </Item>
          <Item rotulo="Renda familiar">
            <span className="valor">{formatarReais(f.vlrRendaFamiliar)}</span>
          </Item>
          <Item rotulo="Dependentes">{f.numDependentes}</Item>
          <Item rotulo="Região">{String(f.codRegiao).padStart(2, "0")}</Item>
          <Item rotulo="NIS">
            <span className="valor font-mono">{f.nis || "—"}</span>
          </Item>
          <Item rotulo="Data de cadastro">{dataTexto(f.dtCadastro)}</Item>
        </dl>
      </CardContent>
    </Card>
  );
}

function TabelaHistorico({ h }: { h: Historico }) {
  return (
    <Card>
      <CardHeader>
        {/* LEGACY-QUIRK(D21) / CORRECAO(D21): o título acompanha o modo (ver tituloHistorico). */}
        <CardTitle>{tituloHistorico(h)}</CardTitle>
      </CardHeader>
      <CardContent>
        {h.mensagem ? (
          <ResultadoLegado variante="info" titulo="Histórico" mensagens={[h.mensagem]} />
        ) : (
          <div className="overflow-x-auto">
            <Table aria-label="Histórico de pagamentos">
              <TableHeader>
                <TableRow>
                  <TableHead>Competência</TableHead>
                  <TableHead className="text-right">Bruto</TableHead>
                  <TableHead className="text-right">Líquido</TableHead>
                  <TableHead>Situação</TableHead>
                  <TableHead>Tipo</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {h.linhas.map((l, i) => (
                  <TableRow key={i}>
                    <TableCell className="valor">{competenciaTexto(l.anoMesRef)}</TableCell>
                    <TableCell className="valor text-right">{formatarReais(l.vlrBruto)}</TableCell>
                    <TableCell className="valor text-right">{formatarReais(l.vlrLiquido)}</TableCell>
                    <TableCell className="font-mono">{l.sitPagamento}</TableCell>
                    <TableCell className="font-mono">{l.tipoPgto}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

/** Pantalla 4.8 — entrada arriba (tipo de busca + CPF/NIS) → ficha + histórico debaixo. */
export function FormConsulta({ cpfInicial, inicial }: { cpfInicial: string; inicial: EstadoConsulta }) {
  const [tipo, setTipo] = useState<TipoBusca>("C");
  const [painel, setPainel] = useState<EstadoConsulta>(inicial);
  const [pendente, iniciar] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      try {
        setPainel(await consultarBeneficiarioAction(null, dados));
        // Busca manual: tira o `?cpf=` da chegada pela lista (um reload não deve mostrar o CPF anterior).
        // History API nativa (integrada ao router do Next): router.replace re-renderizaria a página
        // no servidor e remontaria este formulário (key = cpf), apagando o resultado recém-obtido.
        if (window.location.search) window.history.replaceState(null, "", "/consulta");
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
    });
  };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Dados da consulta">
            <fieldset className="grid gap-1.5">
              <legend className="mb-1.5 text-sm font-medium">Tipo de busca</legend>
              <div className="flex gap-4 text-sm">
                {(["C", "N"] as const).map((t) => (
                  <label key={t} className="flex items-center gap-2">
                    <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => {
                        setTipo(t);
                        setPainel(null);
                      }}
                    />
                    {t === "C" ? "CPF" : "NIS"}
                  </label>
                ))}
              </div>
            </fieldset>
            {tipo === "C" ? (
              <CpfInput key="cpf" name="valor" label="CPF do beneficiário" defaultValue={cpfInicial || undefined} />
            ) : (
              <NisInput key="nis" name="valor" label="NIS do beneficiário" />
            )}
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Consultando…" : "Consultar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {painel && !painel.ok ? <ResultadoLegado variante="erro" mensagens={[painel.mensagem]} /> : null}
      {painel?.ok ? (
        <>
          <Ficha f={painel.ficha} />
          <TabelaHistorico h={painel.historico} />
        </>
      ) : null}
    </div>
  );
}
