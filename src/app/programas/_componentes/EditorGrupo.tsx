"use client";

import { useState } from "react";
import { Campo, Codigo, Fator, Moeda, ResultadoLegado, idsCampo, useAcaoFormulario } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import type { EstadoAcao } from "../estado";

export type ColunaGrupo = {
  campo: string;
  titulo: string;
  tipo: "moeda" | "fator" | "sn" | "codigo2";
};

export type LinhaGrupo = Record<string, string | number>;

/**
 * Edición en línea de un grupo periódico del programa (PE). Guardar reemplaza
 * todas las filas. El límite (5/6) se valida en el dominio; aquí solo se evita
 * agregar filas de más.
 */
export function EditorGrupo({
  idGrupo,
  rotuloLinha,
  colunas,
  linhasIniciais,
  maximo,
  acao,
  novaLinha,
  rotuloGravar,
}: {
  idGrupo: string;
  rotuloLinha: string;
  colunas: readonly ColunaGrupo[];
  linhasIniciais: readonly LinhaGrupo[];
  maximo: number;
  acao: (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;
  novaLinha: LinhaGrupo;
  rotuloGravar: string;
}) {
  const [linhas, setLinhas] = useState(() => linhasIniciais.map((l, i) => ({ chave: i, valores: l })));
  const [proxima, setProxima] = useState(linhasIniciais.length);
  const { estado, onSubmit, pendente } = useAcaoFormulario<EstadoAcao>(acao, null);
  // Los errores vienen indexados por fila: al agregar/quitar filas dejan de corresponder.
  const [mostrarErros, setMostrarErros] = useState(true);

  const adicionar = () => {
    setLinhas((ls) => [...ls, { chave: proxima, valores: novaLinha }]);
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
      aria-label={`Editar ${idGrupo}`}
    >
      {linhas.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhum registro. Use “Adicionar” para incluir.</p>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead scope="col">#</TableHead>
              {colunas.map((c) => (
                <TableHead key={c.campo} scope="col">
                  {c.titulo}
                </TableHead>
              ))}
              <TableHead scope="col">
                <span className="sr-only">Ações</span>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {linhas.map((l, i) => (
              <TableRow key={l.chave}>
                <TableCell className="valor text-muted-foreground">{i + 1}</TableCell>
                {colunas.map((c) => {
                  const base = {
                    name: c.campo,
                    id: `${idGrupo}-${l.chave}-${c.campo}`,
                    label: `${c.titulo} (${rotuloLinha.toLowerCase()} ${i + 1})`,
                    labelOculto: true,
                    erro: erroCampo(i, c.campo),
                  };
                  const v = l.valores[c.campo];
                  return (
                    <TableCell key={c.campo} className="min-w-28 align-top">
                      {c.tipo === "moeda" ? (
                        <Moeda {...base} defaultValue={Number(v ?? 0)} />
                      ) : c.tipo === "fator" ? (
                        <Fator {...base} casas={4} defaultValue={String(v ?? "")} />
                      ) : c.tipo === "codigo2" ? (
                        <Codigo {...base} tamanho={2} defaultValue={v ? String(v).padStart(2, "0") : ""} />
                      ) : (
                        <Campo {...base}>
                          <Select
                            id={base.id}
                            name={c.campo}
                            defaultValue={String(v ?? "N")}
                            className="w-20"
                            aria-describedby={idsCampo(base).describedBy}
                          >
                            <option value="S">S</option>
                            <option value="N">N</option>
                          </Select>
                        </Campo>
                      )}
                    </TableCell>
                  );
                })}
                <TableCell className="align-top">
                  <Button type="button" variant="ghost" size="sm" onClick={() => remover(l.chave)}>
                    Remover<span className="sr-only"> {rotuloLinha.toLowerCase()} {i + 1}</span>
                  </Button>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <Button type="button" variant="outline" size="sm" onClick={adicionar} disabled={linhas.length >= maximo}>
          Adicionar {rotuloLinha.toLowerCase()}
        </Button>
        <Button type="submit" size="sm" disabled={pendente}>
          {pendente ? "Gravando…" : rotuloGravar}
        </Button>
        <span className="text-xs text-muted-foreground">
          {linhas.length} de {maximo}
        </span>
      </div>
      {estado ? <ResultadoLegado variante={estado.ok ? "sucesso" : "erro"} mensagens={estado.mensagens} /> : null}
    </form>
  );
}
