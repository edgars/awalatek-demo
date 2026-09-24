// Página inicial — grupos de navegação (links funcionais chegam nas épicas E1–E7).
const GRUPOS: ReadonlyArray<{ titulo: string; itens: readonly string[] }> = [
  { titulo: "Cadastros", itens: ["Programas sociais", "Beneficiários", "Consulta de beneficiário"] },
  { titulo: "Validações", itens: ["Validação cadastral", "Validação de documentos", "Elegibilidade"] },
  { titulo: "Pagamentos", itens: ["Cálculo de benefício", "Lote mensal", "Descontos", "Pagamentos"] },
  { titulo: "Processos", itens: ["Correção retroativa", "Conciliação bancária"] },
  { titulo: "Relatórios", itens: ["Pagamentos", "Consolidado por competência", "Auditoria"] },
];

export default function Home() {
  return (
    <>
      <h1>SIFAP</h1>
      <nav aria-label="Menu principal" className="grupos">
        {GRUPOS.map((g) => (
          <section key={g.titulo}>
            <h2>{g.titulo}</h2>
            <ul>
              {g.itens.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        ))}
      </nav>
    </>
  );
}
