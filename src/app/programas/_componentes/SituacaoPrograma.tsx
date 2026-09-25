"use client";

import Link from "next/link";
import { useState } from "react";
import { ResultadoLegado, useAcaoFormulario } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { acaoSituacaoDisponivel, textoConfirmacaoSituacao } from "@/domain/programa";
import type { EstadoAcao } from "../estado";

type Props = {
  codPrograma: string;
  sitPrograma: string;
  numVersao: number;
  acao: (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;
};

/**
 * Story 1.2 — Editar / Desativar / Reativar no detalhe do programa, com confirmação na
 * página. Programa encerrado (E) não oferece reativar. Nunca exclui.
 */
export function SituacaoPrograma({ codPrograma, sitPrograma, numVersao, acao }: Props) {
  const { estado, onSubmit, pendente } = useAcaoFormulario<EstadoAcao>(acao, null);
  const [confirmando, setConfirmando] = useState<{ sit: string; versao: number } | null>(null);
  const disponivel = acaoSituacaoDisponivel(sitPrograma);
  // A confirmação vale só para a situação/versão em que foi aberta.
  const aberta = confirmando?.sit === sitPrograma && confirmando.versao === numVersao;
  const rotulo = disponivel === "desativar" ? "Desativar" : "Reativar";

  return (
    <div className="grid justify-items-end gap-3">
      <div className="flex flex-wrap gap-2">
        <Button asChild variant="outline">
          <Link href={`/programas/${codPrograma}/editar`}>Editar</Link>
        </Button>
        {disponivel && !aberta ? (
          <Button type="button" variant={disponivel === "desativar" ? "destructive" : "default"} onClick={() => setConfirmando({ sit: sitPrograma, versao: numVersao })}>
            {rotulo}
          </Button>
        ) : null}
      </div>

      {disponivel && aberta ? (
        <form
          onSubmit={(e) => {
            onSubmit(e);
            setConfirmando(null);
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
            <Button type="button" variant="outline" onClick={() => setConfirmando(null)}>
              Cancelar
            </Button>
            <Button type="submit" variant={disponivel === "desativar" ? "destructive" : "default"} disabled={pendente}>
              {pendente ? "Gravando…" : `Confirmar ${rotulo.toLowerCase()}`}
            </Button>
          </div>
        </form>
      ) : null}

      {estado ? (
        <div className="w-full" data-testid="resultado-situacao">
          <ResultadoLegado variante={estado.ok ? "sucesso" : "erro"} mensagens={estado.mensagens} />
        </div>
      ) : null}
    </div>
  );
}
