"use client";

import Link from "next/link";
import { Campo, Codigo, DataLegada, Fator, Moeda, ResultadoLegado, idsCampo, useAcaoFormulario } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { formatarReais } from "@/domain/money";
import { ROTULOS_TIPO, TIPOS_PROGRAMA } from "@/domain/programa";
import { incluirProgramaAction } from "../actions";
import type { EstadoAcao } from "../estado";

/** Datos gravados que precargan la alteración (story 1.2). */
export type ProgramaGravado = {
  codPrograma: string;
  nomePrograma: string;
  tipoPrograma: string;
  vlrBaseIndividual: number;
  codElegibilidade: string | null;
  dtCriacao: number;
  dtEncerramento: number;
  rendaMaxPercap: number;
  idadeMin: number;
  idadeMax: number;
  fatorReajuste: string;
  numVersao: number;
};

type Props =
  | { alteracao?: undefined }
  | {
      /** Alteración: acción ya ligada al código (inmutable) y datos gravados. */
      alteracao: { acao: (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>; inicial: ProgramaGravado };
    };

/** Pantalla 4.2 — CADASTRO PROGRAMAS SOCIAIS + DADOS DO PROGRAMA; también la alteración (4.3a). */
export function FormInclusao({ alteracao }: Props) {
  const { estado, onSubmit, pendente } = useAcaoFormulario<EstadoAcao>(alteracao?.acao ?? incluirProgramaAction, null);
  const inicial = alteracao?.inicial;
  // Versión vigente: la de la página (revalidada) o la devuelta por la última alteración gravada.
  const versao = Math.max(inicial?.numVersao ?? 0, estado?.ok ? (estado.numVersao ?? 0) : 0);
  // Tras gravar, el formulario se remonta con los datos gravados (valor base vacío,
  // referencia del valor ajustado, fator y fechas tal como quedaron en la base).
  const chaveFormulario = inicial ? `${versao}-${inicial.numVersao}` : "novo";

  const erro = (campo: string) => (estado && !estado.ok ? estado.erros?.[campo] : undefined);
  const tipo = { name: "tipoPrograma", erro: erro("tipoPrograma") };
  const nome = { name: "nomePrograma", erro: erro("nomePrograma") };
  const eleg = { name: "codElegibilidade", erro: erro("codElegibilidade"), descricao: "Posição 1 R = exige NIS; posição 2 D = exige dependentes." };
  const idadeMin = { name: "idadeMin", erro: erro("idadeMin"), descricao: "0 = sem limite" };
  const idadeMax = { name: "idadeMax", erro: erro("idadeMax"), descricao: "0 = sem limite" };
  const codigo = { name: "codPrograma", descricao: "Não editável na alteração." };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form key={chaveFormulario} onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Dados do programa">
            {inicial ? (
              <Campo {...codigo} label="Código do programa">
                {/* Sin `name`: el código es inmutable y el servidor lo toma de la ruta. */}
                <Input id={idsCampo(codigo).id} value={inicial.codPrograma} readOnly className="valor w-[8ch] uppercase" aria-describedby={idsCampo(codigo).describedBy} />
              </Campo>
            ) : (
              <Codigo name="codPrograma" label="Código do programa" tamanho={4} alfanumerico required erro={erro("codPrograma")} />
            )}
            <Campo {...nome} label="Nome" required>
              <Input id={idsCampo(nome).id} name="nomePrograma" maxLength={60} required defaultValue={inicial?.nomePrograma} aria-invalid={nome.erro ? true : undefined} aria-describedby={idsCampo(nome).describedBy} />
            </Campo>
            <Campo {...tipo} label="Tipo" required>
              <Select id={idsCampo(tipo).id} name="tipoPrograma" defaultValue={inicial?.tipoPrograma ?? ""} required aria-invalid={tipo.erro ? true : undefined} aria-describedby={idsCampo(tipo).describedBy}>
                <option value="" disabled>
                  Selecione…
                </option>
                {TIPOS_PROGRAMA.map((t) => (
                  <option key={t} value={t}>
                    {t} — {ROTULOS_TIPO[t]}
                  </option>
                ))}
              </Select>
            </Campo>
            {inicial ? (
              // LEGACY-QUIRK(D8): solo se guarda el valor ya ajustado; no se precarga como
              // valor informado (aplicar FATOR-K sobre él lo duplicaría).
              <Moeda
                name="vlrBase"
                label="Valor base"
                vazioComoVazio
                erro={erro("vlrBase")}
                descricao={`Valor base gravado (ajustado): ${formatarReais(inicial.vlrBaseIndividual)}. Deixe em branco para manter; informe o valor base para recalcular pelo fator K (obrigatório se o fator de reajuste mudar).`}
              />
            ) : (
              <Moeda name="vlrBase" label="Valor base" required erro={erro("vlrBase")} descricao="Será gravado ajustado pelo fator K." />
            )}
            <Campo {...eleg} label="Código de elegibilidade">
              <Input id={idsCampo(eleg).id} name="codElegibilidade" maxLength={5} className="uppercase" defaultValue={inicial?.codElegibilidade ?? ""} aria-invalid={eleg.erro ? true : undefined} aria-describedby={idsCampo(eleg).describedBy} />
            </Campo>
            <Fator name="fatorReajuste" label="Fator de reajuste" casas={4} defaultValue={inicial?.fatorReajuste} erro={erro("fatorReajuste")} />
            <DataLegada name="dtInicio" label="Data início" defaultValue={inicial?.dtCriacao} erro={erro("dtInicio")} />
            <DataLegada name="dtFim" label="Data fim" defaultValue={inicial?.dtEncerramento} erro={erro("dtFim")} descricao="Vazio = indeterminado." />
            <Moeda name="rendaMaxima" label="Renda máxima" defaultValue={inicial?.rendaMaxPercap} erro={erro("rendaMaxima")} descricao="0 = sem limite" />
            <div className="grid grid-cols-2 gap-4">
              <Campo {...idadeMin} label="Idade mínima">
                <Input id={idsCampo(idadeMin).id} name="idadeMin" inputMode="numeric" maxLength={3} defaultValue={String(inicial?.idadeMin ?? 0)} className="valor" aria-describedby={idsCampo(idadeMin).describedBy} aria-invalid={idadeMin.erro ? true : undefined} />
              </Campo>
              <Campo {...idadeMax} label="Idade máxima">
                <Input id={idsCampo(idadeMax).id} name="idadeMax" inputMode="numeric" maxLength={3} defaultValue={String(inicial?.idadeMax ?? 0)} className="valor" aria-describedby={idsCampo(idadeMax).describedBy} aria-invalid={idadeMax.erro ? true : undefined} />
              </Campo>
            </div>
            {inicial ? <input type="hidden" name="numVersao" value={versao} /> : null}
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Gravando…" : "Gravar"}
              </Button>
              <Button asChild variant="outline">
                <Link href={inicial ? `/programas/${inicial.codPrograma}` : "/programas"}>Voltar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {estado ? (
        <ResultadoLegado variante={estado.ok ? "sucesso" : "erro"} mensagens={estado.mensagens}>
          {estado.conflito ? (
            <Button type="button" variant="outline" size="sm" onClick={() => window.location.reload()}>
              Recarregar
            </Button>
          ) : null}
          {estado.ok && estado.codPrograma ? (
            <Link href={`/programas/${estado.codPrograma}`} className="font-medium text-primary underline underline-offset-4">
              Ver programa {estado.codPrograma}
            </Link>
          ) : null}
        </ResultadoLegado>
      ) : null}
    </div>
  );
}
