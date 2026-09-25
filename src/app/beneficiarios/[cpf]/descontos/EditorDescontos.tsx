"use client";

import { useState } from "react";
import { Campo, DataLegada, Fator, Moeda, ResultadoLegado, idsCampo, useAcaoFormulario } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EstadoDescontos } from "./actions";

export type LinhaDesconto = {
  tipoDesconto: string;
  vlrDesconto: number;
  pctDesconto: string;
  dtInicioDsct: number;
  dtFimDsct: number;
  numProcesso: string;
  /** Vigência calculada no servidor para a fila gravada; `null` = ainda não gravada. */
  vigenteHoje: boolean | null;
};

const NOVA_LINHA: LinhaDesconto = {
  tipoDesconto: "",
  vlrDesconto: 0,
  pctDesconto: "0.00",
  dtInicioDsct: 0,
  dtFimDsct: 0,
  numProcesso: "",
  vigenteHoje: null,
};

const COLUNAS = ["Tipo", "Valor", "Percentual", "Início", "Fim", "Nº processo", "Vigência"] as const;

/**
 * Tabla editable del PE DESCONTOS (máx. 8), mismo patrón que el editor de grupos
 * de programas (1.1): guardar reemplaza todas las filas; el límite se valida en el dominio.
 */
export function EditorDescontos({
  acao,
  linhasIniciais,
  maximo,
  tipos,
  tamanhoProcesso,
}: {
  acao: (estado: EstadoDescontos, dados: FormData) => Promise<EstadoDescontos>;
  linhasIniciais: readonly LinhaDesconto[];
  maximo: number;
  tipos: readonly { codigo: string; rotulo: string }[];
  tamanhoProcesso: number;
}) {
  const [linhas, setLinhas] = useState(() => linhasIniciais.map((l, i) => ({ chave: i, valores: l })));
  const [proxima, setProxima] = useState(linhasIniciais.length);
  // Tras grabar, el indicador de vigencia pasa a reflejar lo grabado.
  const acaoComVigencia = async (anterior: EstadoDescontos, dados: FormData): Promise<EstadoDescontos> => {
    const r = await acao(anterior, dados);
    const vigentes = r?.ok ? r.vigentes : undefined;
    if (vigentes) setLinhas((ls) => ls.map((l, i) => ({ ...l, valores: { ...l.valores, vigenteHoje: vigentes[i] ?? null } })));
    return r;
  };
  const { estado, onSubmit, pendente } = useAcaoFormulario<EstadoDescontos>(acaoComVigencia, null);
  // Los errores vienen indexados por fila: al agregar/quitar filas dejan de corresponder.
  const [mostrarErros, setMostrarErros] = useState(true);

  const adicionar = () => {
    setLinhas((ls) => [...ls, { chave: proxima, valores: NOVA_LINHA }]);
    setProxima((n) => n + 1);
    setMostrarErros(false);
  };
  const remover = (chave: number) => {
    setLinhas((ls) => ls.filter((l) => l.chave !== chave));
    setMostrarErros(false);
  };
  const erroCampo = (i: number, campo: string) =>
    mostrarErros && estado && !estado.ok ? estado.erros?.[`${i}.${campo}`] : undefined;

  return (
    <form
      onSubmit={(e) => {
        setMostrarErros(true);
        onSubmit(e);
      }}
      noValidate
      className="grid gap-3"
      aria-label="Editar descontos"
    >
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum desconto registrado. Use “Adicionar desconto” para incluir.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">#</TableHead>
              {COLUNAS.map((c) => (
                <TableHead key={c} scope="col">
                  {c}
                </TableHead>
              ))}
              <TableHead scope="col">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l, i) => {
              const base = (campo: string, titulo: string) => ({
                name: campo,
                id: `desconto-${l.chave}-${campo}`,
                label: `${titulo} (desconto ${i + 1})`,
                labelOculto: true,
                erro: erroCampo(i, campo),
              });
              const tipo = base("tipoDesconto", "Tipo");
              const processo = base("numProcesso", "Nº processo");
              const v = l.valores;
              return (
                <TableRow key={l.chave} data-testid={`desconto-${i + 1}`}>
                  <TableCell className="valor align-top text-muted-foreground">{i + 1}</TableCell>
                  <TableCell className="min-w-44 align-top">
                    <Campo {...tipo}>
                      <Select
                        id={tipo.id}
                        name={tipo.name}
                        defaultValue={v.tipoDesconto}
                        aria-invalid={tipo.erro ? true : undefined}
                        aria-describedby={idsCampo(tipo).describedBy}
                      >
                        <option value="">Selecione…</option>
                        {tipos.map((t) => (
                          <option key={t.codigo} value={t.codigo}>
                            {t.codigo} — {t.rotulo}
                          </option>
                        ))}
                      </Select>
                    </Campo>
                  </TableCell>
                  <TableCell className="min-w-32 align-top">
                    <Moeda {...base("vlrDesconto", "Valor")} defaultValue={v.vlrDesconto} />
                  </TableCell>
                  <TableCell className="min-w-24 align-top">
                    <Fator {...base("pctDesconto", "Percentual")} casas={2} defaultValue={v.pctDesconto} />
                  </TableCell>
                  <TableCell className="align-top">
                    <DataLegada {...base("dtInicioDsct", "Início")} defaultValue={v.dtInicioDsct} />
                  </TableCell>
                  <TableCell className="align-top">
                    <DataLegada {...base("dtFimDsct", "Fim")} defaultValue={v.dtFimDsct} descricao="vazio = indefinido" />
                  </TableCell>
                  <TableCell className="min-w-40 align-top">
                    <Campo {...processo}>
                      <Input
                        id={processo.id}
                        name={processo.name}
                        defaultValue={v.numProcesso}
                        maxLength={tamanhoProcesso}
                        autoComplete="off"
                        className="valor"
                        aria-invalid={processo.erro ? true : undefined}
                        aria-describedby={idsCampo(processo).describedBy}
                      />
                    </Campo>
                  </TableCell>
                  <TableCell className="align-top">
                    {v.vigenteHoje === null ? (
                      <Badge variant="outline">Não gravado</Badge>
                    ) : v.vigenteHoje ? (
                      <Badge variant="success">Vigente hoje</Badge>
                    ) : (
                      <Badge variant="secondary">Não vigente</Badge>
                    )}
                  </TableCell>
                  <TableCell className="align-top">
                    <Button type="button" variant="ghost" size="sm" onClick={() => remover(l.chave)}>
                      Remover<span className="sr-only"> desconto {i + 1}</span>
                    </Button>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={adicionar} disabled={linhas.length >= maximo}>
          Adicionar desconto
        </Button>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Gravando…" : "Gravar descontos"}
        </Button>
        <span className="text-xs text-muted-foreground">
          {linhas.length} de {maximo}
        </span>
      </div>
      {estado ? <ResultadoLegado variante={estado.ok ? "sucesso" : "erro"} mensagens={estado.mensagens} /> : null}
    </form>
  );
}
