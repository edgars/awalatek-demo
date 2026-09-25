"use client";

import Link from "next/link";
import { useState } from "react";
import { Campo, CpfInput, DataLegada, ResultadoLegado, idsCampo, useAcaoFormulario } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ROTULOS_SEXO } from "@/domain/beneficiario/cadastro";
import { PARENTESCOS, ROTULOS_PARENTESCO, SEXOS_DEPENDENTE } from "@/domain/beneficiario/dependentes";
import type { EstadoDependente } from "./estado";

type Acao = (estado: EstadoDependente, dados: FormData) => Promise<EstadoDependente>;

/**
 * Pantalla 4.6 — DADOS DO DEPENDENTE en serie. Cada "Incluir outro dependente" monta un
 * formulario nuevo (respuesta S de CADDEPEND:126); "Concluir" vuelve a la lista (N).
 * `bloqueio` = mensaje literal que impide incluir (titular C/D o límite D6).
 */
export function InclusaoDependentes({ acao, bloqueio }: { acao: Acao; bloqueio: string | null }) {
  const [rodada, setRodada] = useState(0);
  return <FormDependente key={rodada} acao={acao} bloqueio={bloqueio} onOutro={() => setRodada((r) => r + 1)} />;
}

function FormDependente({ acao, bloqueio, onOutro }: { acao: Acao; bloqueio: string | null; onOutro: () => void }) {
  const { estado, onSubmit, pendente } = useAcaoFormulario<EstadoDependente>(acao, null);

  if (estado?.ok) {
    return (
      <ResultadoLegado variante="sucesso" mensagens={estado.mensagens}>
        <div className="flex flex-wrap gap-2">
          <Button type="button" onClick={onOutro} autoFocus>
            Incluir outro dependente
          </Button>
          <Button asChild variant="outline">
            <Link href="/beneficiarios">Concluir</Link>
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
