"use client";

import Link from "next/link";
import { Campo, Codigo, DataLegada, Fator, Moeda, ResultadoLegado, idsCampo, useAcaoFormulario } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ROTULOS_TIPO, TIPOS_PROGRAMA } from "@/domain/programa";
import { incluirProgramaAction } from "../actions";
import type { EstadoAcao } from "../estado";

/** Pantalla 4.2 — CADASTRO PROGRAMAS SOCIAIS + DADOS DO PROGRAMA. */
export function FormInclusao() {
  const { estado, onSubmit, pendente } = useAcaoFormulario<EstadoAcao>(incluirProgramaAction, null);
  const erro = (campo: string) => (estado && !estado.ok ? estado.erros?.[campo] : undefined);
  const tipo = { name: "tipoPrograma", erro: erro("tipoPrograma") };
  const nome = { name: "nomePrograma", erro: erro("nomePrograma") };
  const eleg = { name: "codElegibilidade", erro: erro("codElegibilidade"), descricao: "Posição 1 R = exige NIS; posição 2 D = exige dependentes." };
  const idadeMin = { name: "idadeMin", erro: erro("idadeMin"), descricao: "0 = sem limite" };
  const idadeMax = { name: "idadeMax", erro: erro("idadeMax"), descricao: "0 = sem limite" };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Dados do programa">
            <Codigo name="codPrograma" label="Código do programa" tamanho={4} alfanumerico required erro={erro("codPrograma")} />
            <Campo {...nome} label="Nome" required>
              <Input id={idsCampo(nome).id} name="nomePrograma" maxLength={60} required aria-invalid={nome.erro ? true : undefined} aria-describedby={idsCampo(nome).describedBy} />
            </Campo>
            <Campo {...tipo} label="Tipo" required>
              <Select id={idsCampo(tipo).id} name="tipoPrograma" defaultValue="" required aria-invalid={tipo.erro ? true : undefined} aria-describedby={idsCampo(tipo).describedBy}>
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
            <Moeda name="vlrBase" label="Valor base" required erro={erro("vlrBase")} descricao="Será gravado ajustado pelo fator K." />
            <Campo {...eleg} label="Código de elegibilidade">
              <Input id={idsCampo(eleg).id} name="codElegibilidade" maxLength={5} className="uppercase" aria-invalid={eleg.erro ? true : undefined} aria-describedby={idsCampo(eleg).describedBy} />
            </Campo>
            <Fator name="fatorReajuste" label="Fator de reajuste" casas={4} erro={erro("fatorReajuste")} />
            <DataLegada name="dtInicio" label="Data início" erro={erro("dtInicio")} />
            <DataLegada name="dtFim" label="Data fim" erro={erro("dtFim")} descricao="Vazio = indeterminado." />
            <Moeda name="rendaMaxima" label="Renda máxima" erro={erro("rendaMaxima")} descricao="0 = sem limite" />
            <div className="grid grid-cols-2 gap-4">
              <Campo {...idadeMin} label="Idade mínima">
                <Input id={idsCampo(idadeMin).id} name="idadeMin" inputMode="numeric" maxLength={3} defaultValue="0" className="valor" aria-describedby={idsCampo(idadeMin).describedBy} aria-invalid={idadeMin.erro ? true : undefined} />
              </Campo>
              <Campo {...idadeMax} label="Idade máxima">
                <Input id={idsCampo(idadeMax).id} name="idadeMax" inputMode="numeric" maxLength={3} defaultValue="0" className="valor" aria-describedby={idsCampo(idadeMax).describedBy} aria-invalid={idadeMax.erro ? true : undefined} />
              </Campo>
            </div>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Gravando…" : "Gravar"}
              </Button>
              <Button asChild variant="outline">
                <Link href="/programas">Voltar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {estado ? (
        <ResultadoLegado variante={estado.ok ? "sucesso" : "erro"} mensagens={estado.mensagens}>
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
