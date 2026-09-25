import type { Metadata } from "next";
import { MSG_BENEFICIARIO_NAO_ENCONTRADO } from "@/domain/beneficiario/consulta";
import { cpfPorChave } from "@/server/beneficiarios";
import { FormConsulta } from "./_componentes/FormConsulta";
import type { EstadoConsulta } from "./estado";
import { executarConsulta } from "./executar";

export const metadata: Metadata = { title: "Consulta de beneficiário" };

/**
 * Pantalla 4.8 — Consulta de beneficiário (CONSBENF). `?benef=<chave opaca>` consulta direto
 * (ação "Consultar" da lista). H2 (LGPD): o CPF nunca vai na URL; é resolvido no servidor.
 */
export default async function ConsultaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const benef = typeof sp.benef === "string" ? sp.benef : "";
  const cpf = benef ? ((await cpfPorChave(benef)) ?? "") : "";
  // Chave malformada ou inexistente → mesma resposta do legado para CPF não encontrado.
  const inicial: EstadoConsulta = cpf
    ? await executarConsulta("C", cpf)
    : benef
      ? { ok: false, mensagem: MSG_BENEFICIARIO_NAO_ENCONTRADO }
      : null;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consulta de beneficiário</h1>
        <p className="text-sm text-muted-foreground">Busca por CPF ou NIS e mostra os dados cadastrais e o histórico de pagamentos.</p>
      </div>
      <FormConsulta key={benef} cpfInicial={cpf} inicial={inicial} />
    </div>
  );
}
