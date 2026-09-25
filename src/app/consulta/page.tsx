import type { Metadata } from "next";
import { FormConsulta } from "./_componentes/FormConsulta";
import type { EstadoConsulta } from "./estado";
import { executarConsulta } from "./executar";

export const metadata: Metadata = { title: "Consulta de beneficiário" };

/** Pantalla 4.8 — Consulta de beneficiário (CONSBENF). `?cpf=` consulta direto (ação "Consultar" da lista). */
export default async function ConsultaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const cpf = typeof sp.cpf === "string" ? sp.cpf.replace(/\D/g, "").slice(0, 11) : "";
  const inicial: EstadoConsulta = cpf ? await executarConsulta("C", cpf) : null;

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Consulta de beneficiário</h1>
        <p className="text-sm text-muted-foreground">Busca por CPF ou NIS e mostra os dados cadastrais e o histórico de pagamentos.</p>
      </div>
      <FormConsulta key={cpf} cpfInicial={cpf} inicial={inicial} />
    </div>
  );
}
