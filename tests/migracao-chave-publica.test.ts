import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// H2 — a migração h2_chave_publica aplicada sobre uma base JÁ populada (as migrações
// anteriores + beneficiários existentes) preenche `chavePublica` com UUID v4 em minúsculas,
// únicos, sem perder dados nem vínculos.

const RAIZ = fileURLToPath(new URL("..", import.meta.url));
const MIGRACOES = path.join(RAIZ, "prisma", "migrations");
const UUID_V4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const N = 500;

function sql(nome: string): string {
  return readFileSync(path.join(MIGRACOES, nome, "migration.sql"), "utf8");
}

describe("migração h2_chave_publica (backfill)", () => {
  const pastas = readdirSync(MIGRACOES).filter((n) => /^\d{14}_/.test(n)).sort();
  const h2 = pastas.find((n) => n.endsWith("_h2_chave_publica"));

  it("aplicada sobre uma base populada gera UUID v4 minúsculos, únicos e preserva os dados", () => {
    expect(h2).toBeDefined();
    const db = new DatabaseSync(":memory:");
    try {
      for (const p of pastas.slice(0, pastas.indexOf(h2!))) db.exec(sql(p));
      db.prepare(
        `INSERT INTO "ProgramaSocial" ("codPrograma", "nomePrograma", "tipoPrograma", "dtCriacao", "vlrBaseIndividual", "fatorReajuste", "fatorK")
         VALUES ('PA01', 'PROGRAMA', 'A', 20000101, 10000, '1.0000', '1.0000')`,
      ).run();
      const inserir = db.prepare(
        `INSERT INTO "Beneficiario" ("numCpf", "nomeCompleto", "dtNascimento", "sexo", "codRegiao", "codPrograma", "dtCadastro", "sitBeneficiario", "vlrRendaFamiliar")
         VALUES (?, ?, 19800101, 'F', 1, 'PA01', 20200101, 'A', 1000)`,
      );
      db.exec("BEGIN");
      for (let i = 0; i < N; i++) inserir.run(String(i).padStart(11, "0"), `NOME ${i}`);
      db.exec("COMMIT");
      const idMaria = (db.prepare(`SELECT id FROM "Beneficiario" WHERE numCpf = ?`).get("00000000007") as unknown as { id: number }).id;
      db.prepare(
        `INSERT INTO "BeneficiarioDependente" ("beneficiarioId", "occurrence", "nomeDependente", "dtNascDepend", "parentesco") VALUES (?, 1, 'DEP', 20100101, 'FI')`,
      ).run(idMaria);

      db.exec(sql(h2!));

      const linhas = db.prepare(`SELECT id, numCpf, nomeCompleto, chavePublica FROM "Beneficiario" ORDER BY id`).all() as unknown as {
        id: number;
        numCpf: string;
        nomeCompleto: string;
        chavePublica: string;
      }[];
      expect(linhas).toHaveLength(N);
      for (const l of linhas) {
        expect(l.chavePublica).toMatch(UUID_V4);
        expect(l.nomeCompleto).toBe(`NOME ${Number(l.numCpf)}`);
      }
      expect(new Set(linhas.map((l) => l.chavePublica)).size).toBe(N);
      // Vínculos preservados (a tabela é recriada) e índice único ativo.
      expect({ ...db.prepare(`SELECT numCpf FROM "Beneficiario" b JOIN "BeneficiarioDependente" d ON d.beneficiarioId = b.id`).get() }).toEqual({
        numCpf: "00000000007",
      });
      expect(() => db.prepare(`UPDATE "Beneficiario" SET chavePublica = ? WHERE id = ?`).run(linhas[0]!.chavePublica, linhas[1]!.id)).toThrow(
        /UNIQUE/,
      );
      expect(db.prepare("PRAGMA foreign_key_check").all()).toEqual([]);
    } finally {
      db.close();
    }
  });
});
