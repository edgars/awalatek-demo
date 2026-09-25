"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ResultadoLegado, useAcaoFormulario } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { acaoSituacaoDisponivel, podeAlterarPrograma, textoConfirmacaoSituacao } from "@/domain/programa";
import type { EstadoAcao } from "../estado";

type Props = {
  codPrograma: string;
  sitPrograma: string;
  numVersao: number;
  acao: (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;
};

/**
 * Story 1.2 — Editar / Desativar / Reativar no detalhe do programa, com confirmação na
 * página. Programa encerrado (E) não oferece editar nem reativar. Nunca exclui.
 * Foco como na confirmação da conciliação: "Confirmar" ao abrir; de volta ao botão que
 * abriu ao cancelar (ou Escape) e depois do resultado.
 */
export function SituacaoPrograma({ codPrograma, sitPrograma, numVersao, acao }: Props) {
  const { estado, onSubmit, pendente } = useAcaoFormulario<EstadoAcao>(acao, null);
  // A confirmação fica aberta (e pendente) até chegar um resultado novo: guarda o
  // estado vigente ao abrir e fecha quando `estado` muda (sem setState em efeito).
  const [abertaEm, setAbertaEm] = useState<{ estado: EstadoAcao } | null>(null);
  const aberta = abertaEm !== null && abertaEm.estado === estado;
  const botaoAcao = useRef<HTMLButtonElement>(null);
  const botaoConfirmar = useRef<HTMLButtonElement>(null);
  const devolverFoco = useRef(false);

  const disponivel = acaoSituacaoDisponivel(sitPrograma);
  const rotulo = disponivel === "desativar" ? "Desativar" : "Reativar";

  useEffect(() => {
    if (aberta) {
      botaoConfirmar.current?.focus();
    } else if (devolverFoco.current) {
      devolverFoco.current = false;
      botaoAcao.current?.focus();
    }
  }, [aberta]);

  const cancelar = () => {
    if (pendente) return;
    devolverFoco.current = true;
    setAbertaEm(null);
  };

  const confirmar = (e: FormEvent<HTMLFormElement>) => {
    devolverFoco.current = true;
    onSubmit(e);
  };

  return (
    <div className="grid justify-items-end gap-3">
      <div className="flex flex-wrap gap-2">
        {podeAlterarPrograma(sitPrograma) ? (
          <Button asChild variant="outline">
            <Link href={`/programas/${codPrograma}/editar`}>Editar</Link>
          </Button>
        ) : null}
        {disponivel && !aberta ? (
          <Button
            ref={botaoAcao}
            type="button"
            variant={disponivel === "desativar" ? "destructive" : "default"}
            onClick={() => setAbertaEm({ estado })}
          >
            {rotulo}
          </Button>
        ) : null}
      </div>

      {disponivel && aberta ? (
        <form
          onSubmit={confirmar}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              e.preventDefault();
              cancelar();
            }
          }}
          role="alertdialog"
          aria-labelledby="confirmacao-situacao"
          className="grid w-full max-w-xl gap-3 rounded-md border border-destructive/40 bg-card p-4"
        >
          <p id="confirmacao-situacao" className="text-sm">
            {textoConfirmacaoSituacao(codPrograma, disponivel)}
          </p>
          <input type="hidden" name="acao" value={disponivel} />
          <input type="hidden" name="numVersao" value={numVersao} />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={cancelar} disabled={pendente}>
              Cancelar
            </Button>
            <Button ref={botaoConfirmar} type="submit" variant={disponivel === "desativar" ? "destructive" : "default"} disabled={pendente}>
              {pendente ? "Gravando…" : `Confirmar ${rotulo.toLowerCase()}`}
            </Button>
          </div>
        </form>
      ) : null}

      {estado ? (
        <div className="w-full" data-testid="resultado-situacao">
          <ResultadoLegado variante={estado.ok ? "sucesso" : "erro"} mensagens={estado.mensagens}>
            {estado.conflito ? (
              <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
                Recarregar
              </Button>
            ) : null}
          </ResultadoLegado>
        </div>
      ) : null}
    </div>
  );
}
