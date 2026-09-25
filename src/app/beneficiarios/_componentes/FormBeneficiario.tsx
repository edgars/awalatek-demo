"use client";

import Link from "next/link";
import { useState } from "react";
import { Campo, CpfInput, DataLegada, Moeda, NisInput, ResultadoLegado, idsCampo, useAcaoFormulario } from "@/components/campos";
import { mascararCep, somenteDigitos } from "@/components/campos/conversao";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import {
  MENSAGENS_SISTEMA,
  ROTULOS_SEXO,
  ROTULOS_SITUACAO_BENEFICIARIO,
  SEXOS,
  SITUACOES_BENEFICIARIO,
  UFS,
} from "@/domain/beneficiario/cadastro";
import type { EstadoAcao } from "../estado";

export type OpcaoPrograma = { codPrograma: string; nomePrograma: string };

/** Valores iniciales de la alteración (registro actual). */
export type ValoresBeneficiario = {
  numCpf: string;
  nomeCompleto: string;
  dtNascimento: number;
  sexo: string;
  logradouro: string | null;
  municipio: string | null;
  uf: string | null;
  cep: number | null;
  telFixo: string | null;
  rgNumero: string | null;
  codPrograma: string;
  vlrRendaFamiliar: number;
  numDependentes: number;
  codRegiao: number;
  nis: string | null;
  sitBeneficiario: string;
  numVersao: number;
};

function dataBr(dt: number): string {
  const s = String(dt).padStart(8, "0");
  return `${s.slice(6, 8)}/${s.slice(4, 6)}/${s.slice(0, 4)}`;
}

/** Campo de solo lectura en la alteración: muestra el valor y lo reenvía para que el servidor verifique que no cambió. */
function SomenteLeitura({ name, label, valor, exibicao }: { name: string; label: string; valor: string; exibicao: string }) {
  const p = { name, label, descricao: "Não editável na alteração." };
  const { id, describedBy } = idsCampo(p);
  return (
    <Campo {...p}>
      <Input id={id} value={exibicao} readOnly aria-readonly="true" aria-describedby={describedBy} className="valor bg-muted" />
      <input type="hidden" name={name} value={valor} />
    </Campo>
  );
}

/** Pantalla 4.5 — CADASTRO DE BENEFICIARIO: inclusión (I) o alteración (A). */
export function FormBeneficiario({
  acao,
  programas,
  inicial,
  statusBrancoAlteracao = false,
}: {
  acao: (estado: EstadoAcao, dados: FormData) => Promise<EstadoAcao>;
  programas: readonly OpcaoPrograma[];
  /** Presente → alteración. */
  inicial?: ValoresBeneficiario;
  /** LEGACY-QUIRK(D18) activo: la alteración no ofrece el select de situación. */
  statusBrancoAlteracao?: boolean;
}) {
  const alteracao = inicial !== undefined;
  const { estado, onSubmit, pendente } = useAcaoFormulario<EstadoAcao>(acao, null);
  const [cep, setCep] = useState(inicial?.cep ? mascararCep(String(inicial.cep).padStart(8, "0")) : "");
  // Última versión/situación grabadas con éxito: no dependen de `estado.ok`, así un
  // error de validación no remonta el select ni pierde la elección del operador.
  const [gravado, setGravado] = useState({ numVersao: inicial?.numVersao ?? 0, status: inicial?.sitBeneficiario ?? "A" });
  if (estado?.ok && estado.numVersao && estado.status && estado.numVersao !== gravado.numVersao) {
    setGravado({ numVersao: estado.numVersao, status: estado.status });
  }
  const erro = (campo: string) => (estado && !estado.ok ? estado.erros?.[campo] : undefined);
  const texto = (name: string, label: string, max: number, extra: { required?: boolean; defaultValue?: string | null; className?: string } = {}) => {
    const p = { name, label, erro: erro(name), required: extra.required };
    const { id, describedBy } = idsCampo(p);
    return (
      <Campo {...p} className={extra.className}>
        <Input
          id={id}
          name={name}
          maxLength={max}
          defaultValue={extra.defaultValue ?? ""}
          required={extra.required}
          aria-invalid={p.erro ? true : undefined}
          aria-describedby={describedBy}
        />
      </Campo>
    );
  };
  const select = (name: string, label: string, opcoes: readonly (readonly [string, string])[], defaultValue: string, required = false) => {
    const p = { name, label, erro: erro(name), required };
    const { id, describedBy } = idsCampo(p);
    return (
      <Campo {...p}>
        <Select
          // Tras grabar, la situación puede haber cambiado (D5): se vuelve a montar con el valor grabado.
          key={name === "sitBeneficiario" ? `sit-${gravado.numVersao}` : name}
          id={id}
          name={name}
          defaultValue={defaultValue}
          required={required}
          aria-invalid={p.erro ? true : undefined}
          aria-describedby={describedBy}
        >
          {opcoes.map(([v, r]) => (
            <option key={v} value={v} disabled={v === "" && required}>
              {r}
            </option>
          ))}
        </Select>
      </Campo>
    );
  };
  const nomePrograma = (cod: string) => programas.find((p) => p.codPrograma === cod)?.nomePrograma ?? "";
  const cepP = { name: "cep", label: "CEP", erro: erro("cep") };
  const depP = { name: "numDependentes", label: "Nº dependentes", erro: erro("numDependentes") };
  const regP = { name: "codRegiao", label: "Região", erro: erro("codRegiao"), descricao: "Regiões 01 a 25 ou 99." };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Dados do beneficiário">
            {alteracao ? (
              <CpfInput name="numCpf" label="CPF" defaultValue={inicial.numCpf} readOnly descricao="Não editável na alteração." erro={erro("numCpf")} />
            ) : (
              <CpfInput name="numCpf" label="CPF" required erro={erro("numCpf")} />
            )}
            {texto("nomeCompleto", "Nome", 60, { required: true, defaultValue: inicial?.nomeCompleto })}
            {alteracao ? (
              <SomenteLeitura name="dtNascimento" label="Data de nascimento" valor={String(inicial.dtNascimento)} exibicao={dataBr(inicial.dtNascimento)} />
            ) : (
              <DataLegada name="dtNascimento" label="Data de nascimento" required erro={erro("dtNascimento")} />
            )}
            {alteracao ? (
              <SomenteLeitura name="sexo" label="Sexo" valor={inicial.sexo} exibicao={`${inicial.sexo} — ${ROTULOS_SEXO[inicial.sexo] ?? ""}`} />
            ) : (
              select("sexo", "Sexo", [["", "Selecione…"], ...SEXOS.map((s) => [s, `${s} — ${ROTULOS_SEXO[s]}`] as const)], "", true)
            )}
            {texto("logradouro", "Endereço", 80, { defaultValue: inicial?.logradouro, className: "md:col-span-2" })}
            {texto("municipio", "Município", 40, { defaultValue: inicial?.municipio })}
            {select("uf", "UF", [["", "—"], ...UFS.map((u) => [u, u] as const)], inicial?.uf ?? "")}
            <Campo {...cepP}>
              <Input
                id={idsCampo(cepP).id}
                inputMode="numeric"
                placeholder="00000-000"
                maxLength={9}
                value={cep}
                onChange={(e) => setCep(mascararCep(e.target.value))}
                className="valor"
                aria-invalid={cepP.erro ? true : undefined}
                aria-describedby={idsCampo(cepP).describedBy}
              />
              <input type="hidden" name="cep" value={somenteDigitos(cep, 8)} />
            </Campo>
            {texto("telFixo", "Telefone", 15, { defaultValue: inicial?.telFixo })}
            {texto("rgNumero", "RG", 15, { defaultValue: inicial?.rgNumero })}
            {alteracao ? (
              <SomenteLeitura
                name="codPrograma"
                label="Programa"
                valor={inicial.codPrograma}
                exibicao={`${inicial.codPrograma} – ${nomePrograma(inicial.codPrograma)}`}
              />
            ) : (
              select("codPrograma", "Programa", [["", "Selecione…"], ...programas.map((p) => [p.codPrograma, `${p.codPrograma} – ${p.nomePrograma}`] as const)], "", true)
            )}
            <Moeda name="vlrRendaFamiliar" label="Renda familiar" defaultValue={inicial?.vlrRendaFamiliar} erro={erro("vlrRendaFamiliar")} />
            <Campo {...depP}>
              <Input
                id={idsCampo(depP).id}
                name="numDependentes"
                inputMode="numeric"
                maxLength={2}
                defaultValue={String(inicial?.numDependentes ?? 0)}
                className="valor"
                style={{ width: "6ch" }}
                aria-invalid={depP.erro ? true : undefined}
                aria-describedby={idsCampo(depP).describedBy}
                onChange={(e) => {
                  const limpo = somenteDigitos(e.target.value, 2);
                  if (limpo !== e.target.value) e.target.value = limpo;
                }}
              />
            </Campo>
            {alteracao ? (
              <SomenteLeitura name="codRegiao" label="Região" valor={String(inicial.codRegiao)} exibicao={String(inicial.codRegiao).padStart(2, "0")} />
            ) : (
              <Campo {...regP}>
                <Input
                  id={idsCampo(regP).id}
                  name="codRegiao"
                  inputMode="numeric"
                  maxLength={2}
                  className="valor"
                  style={{ width: "6ch" }}
                  aria-invalid={regP.erro ? true : undefined}
                  aria-describedby={idsCampo(regP).describedBy}
                  onChange={(e) => {
                    const limpo = somenteDigitos(e.target.value, 2);
                    if (limpo !== e.target.value) e.target.value = limpo;
                  }}
                />
              </Campo>
            )}
            {alteracao ? (
              <SomenteLeitura name="nis" label="NIS" valor={inicial.nis ?? ""} exibicao={inicial.nis ?? "—"} />
            ) : (
              <NisInput name="nis" label="NIS" erro={erro("nis")} descricao="Opcional." />
            )}
            {/* LEGACY-QUIRK(D18): con el flag, como CADBENEF, la situación no se informa en la alteración. */}
            {alteracao && !statusBrancoAlteracao
              ? select(
                  "sitBeneficiario",
                  "Situação",
                  SITUACOES_BENEFICIARIO.map((s) => [s, `${s} — ${ROTULOS_SITUACAO_BENEFICIARIO[s]}`] as const),
                  gravado.status,
                  true,
                )
              : null}
            {alteracao ? <input type="hidden" name="numVersao" value={gravado.numVersao} /> : null}
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Gravando…" : "Gravar"}
              </Button>
              <Button asChild variant="outline">
                <Link href="/beneficiarios">Voltar</Link>
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {estado?.ok && estado.suspensoPorIdade ? (
        <Alert variant="warning" role="status">
          <AlertDescription>{MENSAGENS_SISTEMA.suspensoPorIdade}</AlertDescription>
        </Alert>
      ) : null}
      {estado ? (
        <ResultadoLegado variante={estado.ok ? "sucesso" : "erro"} mensagens={estado.mensagens}>
          {estado.ok && estado.numCpf && !alteracao ? (
            <Link href={`/beneficiarios/${estado.numCpf}/editar`} className="font-medium text-primary underline underline-offset-4">
              Ver/editar beneficiário
            </Link>
          ) : null}
          {estado.ok && estado.status ? (
            <p className="text-sm">
              Situação gravada: <strong>{estado.status} — {ROTULOS_SITUACAO_BENEFICIARIO[estado.status] ?? estado.status}</strong>
            </p>
          ) : null}
        </ResultadoLegado>
      ) : null}
    </div>
  );
}
