// Mapa de navegación (EXPERIENCE §1). `href` ausente = pantalla de una épica futura.
export type ItemNav = { titulo: string; href?: string };
export type GrupoNav = { titulo: string; itens: readonly ItemNav[] };

export const NAVEGACAO: readonly GrupoNav[] = [
  {
    titulo: "Cadastro",
    itens: [{ titulo: "Programas sociais", href: "/programas" }, { titulo: "Beneficiários", href: "/beneficiarios" }, { titulo: "Consulta", href: "/consulta" }],
  },
  { titulo: "Validação", itens: [{ titulo: "Cadastral", href: "/validacao/cadastro" }, { titulo: "Documentos", href: "/validacao/documentos" }, { titulo: "Elegibilidade", href: "/elegibilidade" }] },
  {
    titulo: "Cálculo e Pagamentos",
    itens: [{ titulo: "Cálculo individual", href: "/calculo" }, { titulo: "Lote mensal", href: "/lote" }, { titulo: "Cálculo de descontos", href: "/descontos" }, { titulo: "Pagamentos", href: "/pagamentos" }],
  },
  { titulo: "Processos", itens: [{ titulo: "Correção retroativa", href: "/correcao" }, { titulo: "Conciliação bancária" }] },
  { titulo: "Relatórios", itens: [{ titulo: "Pagamentos", href: "/relatorios/pagamentos" }, { titulo: "Consolidado" }, { titulo: "Auditoria" }] },
];
