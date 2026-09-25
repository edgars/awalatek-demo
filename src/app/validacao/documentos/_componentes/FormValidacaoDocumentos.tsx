"use client";

import { useState, useTransition, type FormEvent } from "react";
import { Campo, CpfInput, ResultadoLegado, idsCampo } from "@/components/campos";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { MENSAGENS_VALDOCS } from "@/domain/beneficiario/documentos";
import { validarDocumentosAction } from "../actions";
import type { EstadoValidacaoDocumentos } from "../estado";
import { ERRO_INESPERADO } from "@/lib/falhas";

/**
 * Pantalla 4.10 — formulario de proceso: entrada arriba → acción → panel debajo,
 * que permanece hasta la próxima ejecución. Nada se graba.
 */
export function FormValidacaoDocumentos() {
  const [painel, setPainel] = useState<EstadoValidacaoDocumentos>(null);
  const [pendente, iniciar] = useTransition();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const dados = new FormData(e.currentTarget);
    iniciar(async () => {
      try {
        setPainel(await validarDocumentosAction(null, dados));
      } catch {
        setPainel({ ok: false, mensagem: ERRO_INESPERADO });
      }
    });
  };

  const rgP = { name: "rg", label: "RG" };
  const tituloP = { name: "tituloEleitor", label: "Título de eleitor" };
  const ctpsP = { name: "ctps", label: "CTPS" };

  return (
    <div className="grid gap-4">
      <Card>
        <CardContent>
          <form onSubmit={onSubmit} noValidate className="grid gap-4 md:grid-cols-2" aria-label="Documentos para validação">
            <CpfInput name="numCpf" label="CPF" />
            <Campo {...rgP}>
              <Input id={idsCampo(rgP).id} name="rg" maxLength={15} autoComplete="off" className="font-mono" />
            </Campo>
            <Campo {...tituloP}>
              <Input id={idsCampo(tituloP).id} name="tituloEleitor" maxLength={12} autoComplete="off" className="font-mono" />
            </Campo>
            <Campo {...ctpsP}>
              <Input id={idsCampo(ctpsP).id} name="ctps" maxLength={15} autoComplete="off" className="font-mono" />
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
          {painel.docEspecial ? (
            <Badge variant="warning" className="font-mono" data-testid="selo-doc-especial">
              {MENSAGENS_VALDOCS.docEspecial}
            </Badge>
          ) : null}
          {painel.resultado === "V" && !painel.docEspecial ? <p className="text-sm">Nenhum erro encontrado.</p> : null}
        </ResultadoLegado>
      ) : null}
    </div>
  );
}
