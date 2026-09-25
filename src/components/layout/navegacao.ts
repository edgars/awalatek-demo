// Mapa de navegación (EXPERIENCE §1). `href` ausente = pantalla de una épica futura.
export type ItemNav = { titulo: string; href?: string };
export type GrupoNav = { titulo: string; itens: readonly ItemNav[] };

export const NAVEGACAO: readonly GrupoNav[] = [
  {
    titulo: "Cadastro",
    itens: [{ titulo: "Programas sociais", href: "/programas" }, { titulo: "Beneficiários", href: "/beneficiarios" }, { titulo: "Consulta" }],
  },
  { titulo: "Validação", itens: [{ titulo: "Cadastral", href: "/validacao/cadastro" }, { titulo: "Documentos", href: "/validacao/documentos" }, { titulo: "Elegibilidade" }] },
  {
    titulo: "Cálculo e Pagamentos",
    itens: [{ titulo: "Cálculo individual", href: "/calculo" }, { titulo: "Lote mensal" }, { titulo: "Cálculo de descontos" }, { titulo: "Pagamentos" }],
  },
  { titulo: "Processos", itens: [{ titulo: "Correção retroativa" }, { titulo: "Conciliação bancária" }] },
  { titulo: "Relatórios", itens: [{ titulo: "Pagamentos" }, { titulo: "Consolidado" }, { titulo: "Auditoria" }] },
];
