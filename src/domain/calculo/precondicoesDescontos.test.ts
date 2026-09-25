import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import {
  MSG_BENEFICIARIO_NAO_ENCONTRADO,
  MSG_PAGAMENTO_NAO_ENCONTRADO,
  verificarBeneficiario,
  verificarPagamento,
  verificarPrecondicoesDescontos,
} from "./precondicoesDescontos";

const CPF = "01234567890";
const OUTRO = "12345678062";
const BENEF = { numCpf: CPF };

describe("FR-DSC-01 — precondições do recálculo de descontos", () => {
  it("pagamento do CPF + beneficiário → ok", () => {
    expect(verificarPrecondicoesDescontos({ numCpf: CPF, pagamento: { numCpf: CPF }, beneficiario: BENEF })).toEqual({ ok: true });
  });

  it("RK-314dbfb4a26e / RK-8b1376b9c23d — pagamento inexistente", () => {
    expect(verificarPrecondicoesDescontos({ numCpf: CPF, pagamento: null, beneficiario: BENEF })).toEqual({
      ok: false,
      mensagem: "PAGAMENTO NAO ENCONTRADO",
    });
    expect(MSG_PAGAMENTO_NAO_ENCONTRADO).toBe("PAGAMENTO NAO ENCONTRADO");
  });

  it("RK-314dbfb4a26e — pagamento de outro CPF conta como não encontrado", () => {
    expect(verificarPrecondicoesDescontos({ numCpf: CPF, pagamento: { numCpf: OUTRO }, beneficiario: BENEF })).toEqual({
      ok: false,
      mensagem: "PAGAMENTO NAO ENCONTRADO",
    });
  });

  it("o pagamento é verificado antes do beneficiário", () => {
    expect(verificarPrecondicoesDescontos({ numCpf: CPF, pagamento: null, beneficiario: null })).toEqual({
      ok: false,
      mensagem: "PAGAMENTO NAO ENCONTRADO",
    });
  });

  it("RK-0a477ffc9ddc — beneficiário inexistente", () => {
    expect(verificarPrecondicoesDescontos({ numCpf: CPF, pagamento: { numCpf: CPF }, beneficiario: null })).toEqual({
      ok: false,
      mensagem: "BENEFICIARIO NAO ENCONTRADO",
    });
    expect(MSG_BENEFICIARIO_NAO_ENCONTRADO).toBe("BENEFICIARIO NAO ENCONTRADO");
  });

  it("verificações isoladas (usadas pelo caso de uso na ordem do legado)", () => {
    expect(verificarPagamento(CPF, { numCpf: CPF })).toEqual({ ok: true });
    expect(verificarPagamento(CPF, { numCpf: OUTRO })).toEqual({ ok: false, mensagem: "PAGAMENTO NAO ENCONTRADO" });
    expect(verificarBeneficiario(BENEF)).toEqual({ ok: true });
    expect(verificarBeneficiario(null)).toEqual({ ok: false, mensagem: "BENEFICIARIO NAO ENCONTRADO" });
  });

  it("rastreabilidade: cita as 3 regras RK com PROG:linha", () => {
    const fonte = readFileSync(fileURLToPath(new URL("./precondicoesDescontos.ts", import.meta.url)), "utf8");
    const regras = ["RK-314dbfb4a26e (CALCDSCT:75)", "RK-8b1376b9c23d (CALCDSCT:82)", "RK-0a477ffc9ddc (CALCDSCT:91)"];
    expect(regras.filter((r) => !fonte.includes(r))).toEqual([]);
  });
});
