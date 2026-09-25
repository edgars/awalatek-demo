import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// Reglas RK de dominio de las historias 4.1/4.2/4.3 → deben estar citadas en
// `src/domain/calculo` como `RK-<clave> (PROG:línea)`. Las reglas de I/O
// (búsquedas, "no encontrado", omisiones del lote, log de progreso) quedan
// para las historias de servidor y no se listan aquí.
const REGRAS: Record<string, string[]> = {
  "motor.ts": [
    // 4.1 — CALCBENF
    "RK-7116b6a5174c (CALCBENF:138)",
    "RK-140d297f9d0c (CALCBENF:139)",
    "RK-886f1116333c (CALCBENF:141)",
    "RK-f8d9475ad104 (CALCBENF:180)",
    "RK-2cced191e62e (CALCBENF:187)",
    "RK-c0d4163cc4d1 (CALCBENF:190)",
    "RK-3461de4d19c8 (CALCBENF:191)",
    "RK-b13aff8bf789 (CALCBENF:193)",
    "RK-5aae34cd08cf (CALCBENF:194)",
    "RK-7e690c7a89ec (CALCBENF:196)",
    "RK-f69f8dc0b6c9 (CALCBENF:306)",
    "RK-999fc6833a38 (CALCBENF:205)",
    "RK-7b2181c12f19 (CALCBENF:206)",
    "RK-2f190186d76b (CALCBENF:207)",
    "RK-511b65011b73 (CALCBENF:210)",
    "RK-f036e04b0398 (CALCBENF:213)",
    "RK-92d4dfd5101f (CALCBENF:225)",
    "RK-4bef7758397d (CALCBENF:229)",
    "RK-bb591a41dbf3 (CALCBENF:232)",
    "RK-9ca5d0466ba9 (CALCBENF:233)",
    "RK-be875b52514d (CALCBENF:242)",
    "RK-3ac3d33b1b42 (CALCBENF:244)",
    "RK-0f5eb2af85a0 (CALCBENF:246)",
    "RK-f53c75ffb923 (CALCBENF:247)",
    "RK-5add7ccbf625 (CALCBENF:248)",
    "RK-f81e5c8b9a62 (CALCBENF:251)",
    "RK-602168305a78 (CALCBENF:252)",
    "RK-2aeddfcfa687 (CALCBENF:254)",
    "RK-66a219e18a6a (CALCBENF:255)",
    "RK-e8d3c677f5bc (CALCBENF:256)",
    "RK-46191b29bce5 (CALCBENF:297)",
    "RK-4bee01aa2d9d (CALCBENF:318)",
    "RK-d190c0ee61bb (CALCBENF:319)",
    "RK-f673b82833b9 (CALCBENF:320)",
    "RK-65e0ed4d5b18 (CALCBENF:321)",
    "RK-8d025b23228f (CALCBENF:266)",
    "RK-45fca1f354da (CALCBENF:267)",
    "RK-d8033ba178e5 (CALCBENF:272)",
    "RK-c28ec6795433 (CALCBENF:273)",
    // 4.2 — BATCHPGT
    "RK-275ebe83e773 (BATCHPGT:108)",
    "RK-af5872bb5b6c (BATCHPGT:109)",
    "RK-8b46847de08b (BATCHPGT:110)",
    "RK-714fd6ddfb82 (BATCHPGT:236)",
    "RK-540fc024b18c (BATCHPGT:237)",
    "RK-0dd27e7579c4 (BATCHPGT:240)",
    "RK-5ea515fab8f3 (BATCHPGT:247)",
    "RK-f5d5302be54b (BATCHPGT:250)",
    "RK-c22371bd5232 (BATCHPGT:251)",
    "RK-214450c0f73f (BATCHPGT:253)",
    "RK-c4f50dc3ca8a (BATCHPGT:254)",
    "RK-536175a6629f (BATCHPGT:256)",
    "RK-809cefb3e473 (BATCHPGT:265)",
    "RK-b9c96b4d502e (BATCHPGT:268)",
    "RK-783a0059ec74 (BATCHPGT:271)",
    "RK-82624e7a43c9 (BATCHPGT:280)",
    "RK-a807625f63e9 (BATCHPGT:282)",
    "RK-4cab47bee5b1 (BATCHPGT:284)",
    "RK-00a9411b5321 (BATCHPGT:285)",
    "RK-d4c02c7ef1e7 (BATCHPGT:292)",
    "RK-1838f13fae05 (BATCHPGT:294)",
    "RK-7d6f8bc734b4 (BATCHPGT:295)",
    "RK-7b2fc1482b07 (BATCHPGT:296)",
    "RK-a049d00d5cfc (BATCHPGT:297)",
    "RK-76c532772e71 (BATCHPGT:298)",
    "RK-a202ec1224da (BATCHPGT:299)",
    "RK-9ff58ea7fd88 (BATCHPGT:300)",
    "RK-76a575ac73c7 (BATCHPGT:301)",
    "RK-6f5f5f139ddf (BATCHPGT:302)",
    "RK-75ff56906ba0 (BATCHPGT:308)",
    "RK-1d328e485c60 (BATCHPGT:309)",
    "RK-2dd8a96d00d2 (BATCHPGT:310)",
    "RK-f56fad9e4ff6 (BATCHPGT:311)",
    "RK-61c33b29d6a8 (BATCHPGT:315)",
    "RK-b5749db3ea0e (BATCHPGT:316)",
    "RK-8cbfbd730fa5 (BATCHPGT:319)",
    "RK-273a402e3fcf (BATCHPGT:320)",
    "RK-bf29157d9a87 (BATCHPGT:370)",
  ],
  "precondicoes.ts": [
    // 4.1 — CALCBENF (FR-CAL-02)
    "RK-a88a2f157187 (CALCBENF:155)",
    "RK-a116de8e94cf (CALCBENF:160)",
    "RK-b030809a3f7c (CALCBENF:174)",
  ],
  "descontos.ts": [
    "RK-83b28551c287 (CALCDSCT:195)",
    "RK-70cdacb35c1a (CALCDSCT:196)",
    "RK-746a7b5738cf (CALCDSCT:102)",
    "RK-3cde6c2d52e2 (CALCDSCT:104)",
    "RK-636a3924f593 (CALCDSCT:105)",
    "RK-07b224be3337 (CALCDSCT:165)",
    "RK-f27df0e84c50 (CALCDSCT:166)",
    "RK-e3256815c49a (CALCDSCT:112)",
    "RK-873a78f8fdfb (CALCDSCT:116)",
    "RK-5d6c495417bb (CALCDSCT:122)",
    "RK-5ebca43330fa (CALCDSCT:125)",
    "RK-7ae0930278f4 (CALCDSCT:128)",
    "RK-813b10f0a6b2 (CALCDSCT:135)",
    "RK-eb8f0ba106d7 (CALCDSCT:138)",
    "RK-88bafd73a684 (CALCDSCT:144)",
    "RK-a6687439e293 (CALCDSCT:149)",
    "RK-43bd100339a0 (CALCDSCT:153)",
    "RK-62ff9a96f5f9 (CALCDSCT:156)",
    "RK-ed72fdc907a3 (CALCDSCT:175)",
    "RK-462a16645319 (CALCDSCT:176)",
  ],
};

describe("rastreabilidade RK → código de domínio", () => {
  for (const [arquivo, regras] of Object.entries(REGRAS)) {
    it(`${arquivo} cita as ${regras.length} regras com PROG:linha`, () => {
      const fonte = readFileSync(fileURLToPath(new URL(`./${arquivo}`, import.meta.url)), "utf8");
      const faltando = regras.filter((r) => !fonte.includes(r));
      expect(faltando).toEqual([]);
    });
  }

  it("sem regras duplicadas na lista", () => {
    const todas = Object.values(REGRAS).flat();
    expect(new Set(todas).size).toBe(todas.length);
  });
});
