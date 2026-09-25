"use client";

import { useRef, useState, useTransition, type FormEvent } from "react";
import { Campo, CpfInput, DataLegada, ResultadoLegado, idsCampo } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { ROTULOS_SITUACAO_BENEFICIARIO, SITUACOES_BENEFICIARIO, UFS } from "@/domain/beneficiario/cadastro";
import type { DadosValbenef } from "@/domain/beneficiario/validacao";
import { carregarDoCadastroAction, validarCadastroAction } from "../actions";
import type { EstadoValidacao } from "../estado";

const ERRO_INESPERADO = "Erro inesperado ao processar a solicitação. Tente novamente.";

const VAZIO: DadosValbenef = { numCpf: "", nomeCompleto: "", dtNascimento: 0, uf: "", sitBeneficiario: "" };

/**
 * Pantalla 4.9 — formulario de proceso: entrada arriba → acción → panel debajo,
 * que permanece hasta la próxima ejecución. Nada se graba.
 */
export function FormValidacaoCadastro() {
  const formRef = useRef<HTMLFormElement>(null);
  // Valores iniciales de los campos; `versao` vuelve a montar los controles tras "Carregar do cadastro".
  const [iniciais, setIniciais] = useState<{ versao: number; dados: DadosValbenef }>({ versao: 0, dados: VAZIO });
  const [painel, setPainel] = useState<EstadoValidacao>(null);
  const [pendente, iniciar] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      try {
        setPainel(await validarCadastroAction(null, dados));
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
    });
  };

  const carregar = () => {
    if (!formRef.current) return;
    const bruto = new FormData(formRef.current).get("numCpf");
    const cpf = typeof bruto === "string" ? bruto : "";
    iniciar(async () => {
      try {
        const r = await carregarDoCadastroAction(cpf);
        if (r.ok) {
          setIniciais((a) => ({ versao: a.versao + 1, dados: r.dados }));
          setPainel(null);
          return;
        }
        // Falha: limpa os demais campos (mantém só o CPF digitado) para não validar
        // um CPF com os dados de outro beneficiário carregado antes.
        setIniciais((a) => ({ versao: a.versao + 1, dados: { ...VAZIO, numCpf: cpf } }));
        setPainel({ ok: false, mensagem: r.mensagem });
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
    });
  };

  const d = iniciais.dados;
  const k = (nome: string) => `${nome}-${iniciais.versao}`;
  const nomeP = { name: "nomeCompleto", label: "Nome" };
  const ufP = { name: "uf", label: "UF" };
  const sitP = { name: "sitBeneficiario", label: "Situação" };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form ref={formRef} onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Dados para validação">
            <div className="grid gap-2">
              <CpfInput key={k("cpf")} name="numCpf" label="CPF" defaultValue={d.numCpf} />
              <div>
                <Button type="button" variant="outline" size="sm" onClick={carregar} disabled={pendente}>
                  Carregar do cadastro
                </Button>
              </div>
            </div>
            <Campo {...nomeP}>
              <Input key={k("nome")} id={idsCampo(nomeP).id} name="nomeCompleto" maxLength={60} defaultValue={d.nomeCompleto} />
            </Campo>
            <DataLegada key={k("dt")} name="dtNascimento" label="Data de nascimento" defaultValue={d.dtNascimento} />
            <Campo {...ufP}>
              <Select key={k("uf")} id={idsCampo(ufP).id} name="uf" defaultValue={d.uf}>
                <option value="">—</option>
                {UFS.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </Select>
            </Campo>
            <Campo {...sitP}>
              <Select key={k("sit")} id={idsCampo(sitP).id} name="sitBeneficiario" defaultValue={d.sitBeneficiario}>
                <option value="">—</option>
                {SITUACOES_BENEFICIARIO.map((s) => (
                  <option key={s} value={s}>
                    {s} — {ROTULOS_SITUACAO_BENEFICIARIO[s]}
                  </option>
                ))}
              </Select>
            </Campo>
            <div className="flex gap-2 md:col-span-2">
              <Button type="submit" disabled={pendente}>
                {pendente ? "Processando…" : "Validar"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {painel && !painel.ok ? <ResultadoLegado variante="erro" mensagens={[painel.mensagem]} /> : null}
      {painel?.ok ? (
        <ResultadoLegado
          variante={painel.resultado === "V" ? "sucesso" : "erro"}
          titulo={painel.resultado === "V" ? "V — Válido" : "I — Inválido"}
          mensagens={painel.erros}
        >
          {painel.resultado === "V" ? <p className="text-sm">Nenhum erro encontrado.</p> : null}
        </ResultadoLegado>
      ) : null}
    </div>
  );
}
