import { describe, expect, it, vi } from "vitest";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
// As validações de borda respondem antes de qualquer acesso à base.
vi.mock("@/server/programas", () => ({
  alterarPrograma: vi.fn(() => {
    throw new Error("não deveria acessar a base");
  }),
  alterarSituacaoPrograma: vi.fn(() => {
    throw new Error("não deveria acessar a base");
  }),
  incluirPrograma: vi.fn(),
  salvarFaixas: vi.fn(),
  salvarParamsRegionais: vi.fn(),
}));

const { alterarProgramaAction, alterarSituacaoProgramaAction } = await import("@/app/programas/actions");

// Story 1.2 — Server Actions de alteração e situação: validação na borda.

function form(campos: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(campos)) f.set(k, v);
  return f;
}

describe("alterarSituacaoProgramaAction", () => {
  it("código da rota vazio ou com mais de 4 posições → PROGRAMA NAO ENCONTRADO", async () => {
    for (const cod of ["", "   ", "ABCDE"]) {
      const r = await alterarSituacaoProgramaAction(cod, null, form({ acao: "desativar", numVersao: "1" }));
      expect(r).toMatchObject({ ok: false, mensagens: ["PROGRAMA NAO ENCONTRADO"] });
    }
  });

  it("ação inválida → recusada", async () => {
    const r = await alterarSituacaoProgramaAction("PA01", null, form({ acao: "excluir", numVersao: "1" }));
    expect(r).toMatchObject({ ok: false, mensagens: ["Ação inválida"] });
  });

  it("versão ausente → mensagem de conflito", async () => {
    const r = await alterarSituacaoProgramaAction("PA01", null, form({ acao: "desativar", numVersao: "" }));
    expect(r).toMatchObject({ ok: false, mensagens: ["Programa alterado por outro usuário. Recarregue a página."] });
  });
});

describe("alterarProgramaAction", () => {
  it("código da rota inválido → PROGRAMA NAO ENCONTRADO", async () => {
    const r = await alterarProgramaAction("", null, form({}));
    expect(r).toMatchObject({ ok: false, mensagens: ["PROGRAMA NAO ENCONTRADO"] });
  });

  it("campos inválidos → mensagens literais da inclusão, por campo", async () => {
    const r = await alterarProgramaAction(
      "PA01",
      null,
      form({ nomePrograma: "", tipoPrograma: "A", vlrBase: "", dtInicio: "20260101", dtFim: "0", rendaMaxima: "0", idadeMin: "0", idadeMax: "0", fatorReajuste: "0.0450", numVersao: "1" }),
    );
    expect(r).toMatchObject({ ok: false, erros: { nomePrograma: "Nome: obrigatório" } });
  });
});
