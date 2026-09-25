"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Campo, CpfInput, DataLegada, ResultadoLegado, idsCampo, useAcaoFormulario } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ROTULOS_SEXO } from "@/domain/beneficiario/cadastro";
import {
  continuarInclusao,
  MENSAGENS_CADDEPEND,
  PARENTESCOS,
  ROTULOS_PARENTESCO,
  SEXOS_DEPENDENTE,
  verificarLimite,
} from "@/domain/beneficiario/dependentes";
import { QUIRKS_PADRAO, type QuirkCorrigivel } from "@/domain/quirks";
import type { EstadoDependente } from "./estado";

type Acao = (estado: EstadoDependente, dados: FormData) => Promise<EstadoDependente>;

/** El cliente no lee el entorno: el servidor le pasa si D6 está corregido. */
function quirksLimite(limiteCorrigido: boolean) {
  return limiteCorrigido ? { corrigidos: new Set<QuirkCorrigivel>(["D6"]) } : QUIRKS_PADRAO;
}

/**
 * Pantalla 4.6 — DADOS DO DEPENDENTE en serie. Cada "Incluir outro dependente" monta un
 * formulario nuevo (respuesta S de CADDEPEND:126); "Concluir" vuelve a la lista (N).
 * `bloqueio` = mensaje literal que impide incluir (titular C/D o límite D6).
 * `limiteCorrigido` = CORRECAO(D6) activa en el servidor (máximo 5).
 */
export function InclusaoDependentes({ acao, bloqueio, limiteCorrigido = false }: { acao: Acao; bloqueio: string | null; limiteCorrigido?: boolean }) {
  const [rodada, setRodada] = useState(0);
  return (
    <FormDependente
      key={rodada}
      acao={acao}
      bloqueio={bloqueio}
      limiteCorrigido={limiteCorrigido}
      onOutro={() => setRodada((r) => r + 1)}
    />
  );
}

function FormDependente({
  acao,
  bloqueio,
  limiteCorrigido,
  onOutro,
}: {
  acao: Acao;
  bloqueio: string | null;
  limiteCorrigido: boolean;
  onOutro: () => void;
}) {
  const { estado, onSubmit, pendente } = useAcaoFormulario<EstadoDependente>(acao, null);
  const router = useRouter();

  if (estado?.ok) {
    // Solo se ofrece otra inclusión si el estado refrescado la permite: titular no C/D
    // (`bloqueio` viene de la página revalidada) y total dentro del límite D6.
    const podeIncluirOutro = bloqueio === null && estado.total !== undefined && verificarLimite(estado.total, quirksLimite(limiteCorrigido)) === null;
    // RK-db6fc93c9e4c (CADDEPEND:126): S continúa; cualquier otra respuesta termina.
    const responder = (resposta: "S" | "N") => {
      if (continuarInclusao(resposta)) onOutro();
      else router.push("/beneficiarios");
    };
    return (
      <ResultadoLegado variante="sucesso" mensagens={estado.mensagens}>
        {podeIncluirOutro ? <p className="mb-2 font-mono text-[0.8125rem]">{MENSAGENS_CADDEPEND.incluirOutro}</p> : null}
        {!podeIncluirOutro && bloqueio !== null ? <p className="mb-2 font-mono text-[0.8125rem]">{bloqueio}</p> : null}
        <div className="flex flex-wrap gap-2">
          {podeIncluirOutro ? (
            <Button type="button" onClick={() => responder("S")} autoFocus>
              Incluir outro dependente
            </Button>
          ) : null}
          <Button type="button" variant="outline" onClick={() => responder("N")} autoFocus={!podeIncluirOutro}>
            Concluir
          </Button>
        </div>
      </ResultadoLegado>
    );
  }

  const erro = (campo: string) => (estado && !estado.ok ? estado.erros?.[campo] : undefined);
  const nomeP = { name: "nomeDependente", label: "Nome", erro: erro("nomeDependente"), required: true };
  const parP = { name: "parentesco", label: "Parentesco", erro: erro("parentesco"), required: true };
  const docP = { name: "docDependente", label: "Documento", erro: erro("docDependente") };
  const sexoP = { name: "sexoDependente", label: "Sexo", erro: erro("sexoDependente") };

  return (
    <div className="grid gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Incluir dependente</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} noValidate aria-label="Dados do dependente">
            <fieldset disabled={bloqueio !== null} className="grid gap-4 md:grid-cols-2">
              <Campo {...nomeP}>
                <Input
                  id={idsCampo(nomeP).id}
                  name="nomeDependente"
                  maxLength={60}
                  required
                  aria-invalid={nomeP.erro ? true : undefined}
                  aria-describedby={idsCampo(nomeP).describedBy}
                />
              </Campo>
              <DataLegada name="dtNascDepend" label="Data de nascimento" erro={erro("dtNascDepend")} />
              <Campo {...parP}>
                <Select
                  id={idsCampo(parP).id}
                  name="parentesco"
                  defaultValue=""
                  required
                  aria-invalid={parP.erro ? true : undefined}
                  aria-describedby={idsCampo(parP).describedBy}
                >
                  <option value="">Selecione…</option>
                  {PARENTESCOS.map((p) => (
                    <option key={p} value={p}>
                      {p} — {ROTULOS_PARENTESCO[p]}
                    </option>
                  ))}
                </Select>
              </Campo>
              <CpfInput name="cpfDependente" label="CPF" descricao="Opcional." erro={erro("cpfDependente")} />
              <Campo {...docP}>
                <Input
                  id={idsCampo(docP).id}
                  name="docDependente"
                  maxLength={15}
                  aria-invalid={docP.erro ? true : undefined}
                  aria-describedby={idsCampo(docP).describedBy}
                />
              </Campo>
              <Campo {...sexoP}>
                <Select
                  id={idsCampo(sexoP).id}
                  name="sexoDependente"
                  defaultValue=""
                  aria-invalid={sexoP.erro ? true : undefined}
                  aria-describedby={idsCampo(sexoP).describedBy}
                >
                  <option value="">—</option>
                  {SEXOS_DEPENDENTE.map((s) => (
                    <option key={s} value={s}>
                      {s} — {ROTULOS_SEXO[s]}
                    </option>
                  ))}
                </Select>
              </Campo>
              <div className="flex gap-2 md:col-span-2">
                <Button type="submit" disabled={pendente}>
                  {pendente ? "Gravando…" : "Gravar"}
                </Button>
                <Button asChild variant="outline">
                  <Link href="/beneficiarios">Voltar</Link>
                </Button>
              </div>
            </fieldset>
          </form>
        </CardContent>
      </Card>

      {bloqueio !== null ? (
        <ResultadoLegado variante="erro" mensagens={[bloqueio]} />
      ) : estado ? (
        <ResultadoLegado variante="erro" mensagens={estado.mensagens} />
      ) : null}
    </div>
  );
}
