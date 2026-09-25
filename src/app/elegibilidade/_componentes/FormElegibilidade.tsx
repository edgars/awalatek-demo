"use client";

import Link from "next/link";
import { useState, useTransition, type FormEvent } from "react";
import { Campo, CpfInput, ResultadoLegado, idsCampo } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { MENSAGENS_VALELEG } from "@/domain/elegibilidade";
import { verificarElegibilidadeAction } from "../actions";
import type { EstadoElegibilidade } from "../estado";

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

type OpcaoPrograma = { codPrograma: string; nomePrograma: string };

function SeloElegibilidade({ elegivel }: { elegivel: boolean }) {
  return (
    <Badge variant={elegivel ? "success" : "destructive"} data-testid="selo-elegibilidade">
      {elegivel ? "ELEGÍVEL" : "NÃO ELEGÍVEL"}
    </Badge>
  );
}

/**
 * Pantalla 4.11 — formulario de proceso: entrada arriba → acción → panel debajo,
 * que permanece hasta la próxima ejecución. Nada se graba.
 */
export function FormElegibilidade({
  programas,
  cpfInicial = "",
  programaInicial = "",
}: {
  programas: readonly OpcaoPrograma[];
  cpfInicial?: string;
  programaInicial?: string;
}) {
  const [painel, setPainel] = useState<EstadoElegibilidade>(null);
  const [pendente, iniciar] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      try {
        setPainel(await verificarElegibilidadeAction(null, dados));
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
    });
  };

  const progP = { name: "codPrograma", label: "Programa" };
  const r = painel?.ok ? painel.resultado : null;

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Dados para verificação">
            <CpfInput name="numCpf" label="CPF do beneficiário" defaultValue={cpfInicial} />
            <Campo {...progP}>
              <Select id={idsCampo(progP).id} name="codPrograma" defaultValue={programaInicial}>
                <option value="">—</option>
                {programas.map((p) => (
                  <option key={p.codPrograma} value={p.codPrograma}>
                    {p.codPrograma} – {p.nomePrograma}
                  </option>
                ))}
              </Select>
            </Campo>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Processando…" : "Verificar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {painel && !painel.ok ? <ResultadoLegado variante="erro" mensagens={[painel.mensagem]} /> : null}
      {/* Precondição falhou: só a mensagem literal, sem selo nem motivos. */}
      {r?.tipo === "precondicao" ? <ResultadoLegado variante="erro" titulo="Não verificado" mensagens={[r.mensagem]} /> : null}
      {r?.tipo === "regiaoEspecial" ? (
        <ResultadoLegado variante="sucesso" titulo={r.mensagem} mensagens={[]}>
          <SeloElegibilidade elegivel />
        </ResultadoLegado>
      ) : null}
      {r?.tipo === "avaliado" ? (
        <ResultadoLegado variante={r.elegivel ? "sucesso" : "erro"} titulo={r.mensagem} mensagens={r.motivos}>
          <div className="flex flex-wrap items-center gap-3">
            <SeloElegibilidade elegivel={r.elegivel} />
            {r.motivos.includes(MENSAGENS_VALELEG.documentacaoIncompleta) ? (
              <Link href="/validacao/documentos" className="text-sm underline underline-offset-4">
                Ir para Validação de documentos
              </Link>
            ) : null}
          </div>
        </ResultadoLegado>
      ) : null}
    </div>
  );
}
