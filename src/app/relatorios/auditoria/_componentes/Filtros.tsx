import Link from "next/link";
import { DataLegada } from "@/components/campos";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select } from "@/components/ui/select";
import { ACOES_FILTRO_AUDITORIA, descricaoAcao, type ErrosFiltrosAuditoria } from "@/domain/relatorios/auditoria";

export type ValoresFiltrosAuditoria = {
  dtIni: number;
  dtFim: number;
  /** Valor crudo de una fecha inválida, mostrado junto al error (el selector no admite días inexistentes). */
  dtIniBruta?: string;
  dtFimBruta?: string;
  acao: string;
  usuario: string;
  tabela: string;
  saida: string;
};

/** Valor recibido que no está entre las opciones del select: opción extra para que el campo lo refleje. */
function OpcaoForaDaLista({ valor, opcoes }: { valor: string; opcoes: readonly string[] }) {
  return valor && !opcoes.includes(valor) ? <option value={valor}>{valor}</option> : null;
}

/** Texto de ayuda con el valor crudo de una fecha inválida (`invalido` = el selector no pudo convertir). */
function informado(bruto?: string): string | undefined {
  return bruto && bruto !== "invalido" ? `Informado: ${bruto}` : undefined;
}

function Erro({ id, texto }: { id: string; texto?: string }) {
  return texto ? (
    <p id={id} className="text-xs font-medium text-destructive">
      {texto}
    </p>
  ) : null;
}

/** Filtros de RELAUDIT (FR-AUD-01/04). Formulario GET: solo consulta, no escribe nada. */
export function Filtros({ v, erros }: { v: ValoresFiltrosAuditoria; erros: ErrosFiltrosAuditoria }) {
  return (
    <form
      // Remonta con cada cambio de filtros: "Limpar" (navegación cliente) no conserva el
      // estado interno de DataLegada ni los defaultValue.
      key={`${v.dtIni}|${v.dtFim}|${v.dtIniBruta}|${v.dtFimBruta}|${v.acao}|${v.usuario}|${v.tabela}|${v.saida}`}
      role="search"
      method="get"
      action="/relatorios/auditoria"
      aria-label="Filtros do relatório"
      className="grid gap-3 rounded-lg border bg-card p-4 sm:grid-cols-2 lg:grid-cols-3 lg:items-start print:hidden"
    >
      <DataLegada name="dtIni" id="filtro-dt-ini" label="Data inicial" defaultValue={v.dtIni || undefined} erro={erros.dtIni} descricao={informado(v.dtIniBruta)} />
      <DataLegada name="dtFim" id="filtro-dt-fim" label="Data final" defaultValue={v.dtFim || undefined} erro={erros.dtFim} descricao={informado(v.dtFimBruta)} />
      <div className="grid gap-1.5">
        <Label htmlFor="filtro-acao">Ação</Label>
        <Select
          id="filtro-acao"
          name="acao"
          defaultValue={v.acao}
          aria-invalid={erros.acao ? true : undefined}
          aria-describedby={erros.acao ? "filtro-acao-erro" : undefined}
        >
          <option value="">Todas</option>
          {ACOES_FILTRO_AUDITORIA.map((a) => (
            <option key={a} value={a}>
              {a} – {descricaoAcao(a)}
            </option>
          ))}
          <OpcaoForaDaLista valor={v.acao} opcoes={ACOES_FILTRO_AUDITORIA} />
        </Select>
        <Erro id="filtro-acao-erro" texto={erros.acao} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filtro-usuario">Usuário</Label>
        <Input
          id="filtro-usuario"
          name="usuario"
          defaultValue={v.usuario}
          maxLength={8}
          autoComplete="off"
          className="valor"
          aria-invalid={erros.usuario ? true : undefined}
          aria-describedby={erros.usuario ? "filtro-usuario-erro" : undefined}
        />
        <Erro id="filtro-usuario-erro" texto={erros.usuario} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filtro-tabela">Tabela</Label>
        <Input
          id="filtro-tabela"
          name="tabela"
          defaultValue={v.tabela}
          maxLength={15}
          autoComplete="off"
          className="valor"
          aria-invalid={erros.tabela ? true : undefined}
          aria-describedby={erros.tabela ? "filtro-tabela-erro" : undefined}
        />
        <Erro id="filtro-tabela-erro" texto={erros.tabela} />
      </div>
      <div className="grid gap-1.5">
        <Label htmlFor="filtro-saida">Saída</Label>
        <Select
          id="filtro-saida"
          name="saida"
          defaultValue={v.saida}
          aria-invalid={erros.saida ? true : undefined}
          aria-describedby={erros.saida ? "filtro-saida-erro" : undefined}
        >
          <option value="T">T – Tela</option>
          <option value="I">I – Impressão</option>
          <OpcaoForaDaLista valor={v.saida} opcoes={["T", "I"]} />
        </Select>
        <Erro id="filtro-saida-erro" texto={erros.saida} />
      </div>
      <div className="flex gap-2 sm:col-span-2 lg:col-span-3">
        <Button type="submit">Gerar relatório</Button>
        <Button asChild variant="ghost">
          <Link href="/relatorios/auditoria">Limpar</Link>
        </Button>
      </div>
    </form>
  );
}
