-- H2 (LGPD): clave opaca y estable de Beneficiario para las URLs (el CPF nunca va en la URL).
-- Backfill: las filas existentes reciben un UUID v4 aleatorio (randomblob) al copiar la tabla;
-- las nuevas lo reciben de Prisma (@default(uuid())).
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Beneficiario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numCpf" TEXT NOT NULL,
    "chavePublica" TEXT NOT NULL,
    "nis" TEXT,
    "numInscricao" INTEGER,
    "nomeCompleto" TEXT NOT NULL,
    "nomeMae" TEXT,
    "nomePai" TEXT,
    "estCivil" TEXT,
    "dtNascimento" INTEGER NOT NULL,
    "sexo" TEXT NOT NULL,
    "rgNumero" TEXT,
    "rgOrgao" TEXT,
    "rgUf" TEXT,
    "rgDtExpedicao" INTEGER,
    "logradouro" TEXT,
    "numero" TEXT,
    "complemento" TEXT,
    "bairro" TEXT,
    "municipio" TEXT,
    "uf" TEXT,
    "cep" INTEGER,
    "codIbge" INTEGER,
    "codRegiao" INTEGER NOT NULL,
    "codPrograma" TEXT NOT NULL,
    "dtCadastro" INTEGER NOT NULL,
    "dtInicioBenef" INTEGER,
    "dtFimBenef" INTEGER,
    "sitBeneficiario" TEXT NOT NULL,
    "motSituacao" TEXT,
    "dtUltSituacao" INTEGER,
    "vlrRendaFamiliar" INTEGER NOT NULL,
    "qtdMembrosFamilia" INTEGER,
    "indRendaPercap" INTEGER,
    "numDependentes" INTEGER NOT NULL DEFAULT 0,
    "documentosOk" TEXT,
    "telFixo" TEXT,
    "telCelular" TEXT,
    "email" TEXT,
    "indBiometria" TEXT,
    "dtColetaBio" INTEGER,
    "codPostoBio" TEXT,
    "hashDigital" TEXT,
    "dtInclusao" INTEGER NOT NULL DEFAULT 0,
    "hrInclusao" INTEGER NOT NULL DEFAULT 0,
    "usrInclusao" TEXT NOT NULL DEFAULT '',
    "dtUltAlteracao" INTEGER NOT NULL DEFAULT 0,
    "hrUltAlteracao" INTEGER NOT NULL DEFAULT 0,
    "usrUltAlteracao" TEXT NOT NULL DEFAULT '',
    "numVersao" INTEGER NOT NULL DEFAULT 1,
    CONSTRAINT "Beneficiario_codPrograma_fkey" FOREIGN KEY ("codPrograma") REFERENCES "ProgramaSocial" ("codPrograma") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Beneficiario" ("chavePublica", "bairro", "cep", "codIbge", "codPostoBio", "codPrograma", "codRegiao", "complemento", "documentosOk", "dtCadastro", "dtColetaBio", "dtFimBenef", "dtInclusao", "dtInicioBenef", "dtNascimento", "dtUltAlteracao", "dtUltSituacao", "email", "estCivil", "hashDigital", "hrInclusao", "hrUltAlteracao", "id", "indBiometria", "indRendaPercap", "logradouro", "motSituacao", "municipio", "nis", "nomeCompleto", "nomeMae", "nomePai", "numCpf", "numDependentes", "numInscricao", "numVersao", "numero", "qtdMembrosFamilia", "rgDtExpedicao", "rgNumero", "rgOrgao", "rgUf", "sexo", "sitBeneficiario", "telCelular", "telFixo", "uf", "usrInclusao", "usrUltAlteracao", "vlrRendaFamiliar") SELECT lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6))), "bairro", "cep", "codIbge", "codPostoBio", "codPrograma", "codRegiao", "complemento", "documentosOk", "dtCadastro", "dtColetaBio", "dtFimBenef", "dtInclusao", "dtInicioBenef", "dtNascimento", "dtUltAlteracao", "dtUltSituacao", "email", "estCivil", "hashDigital", "hrInclusao", "hrUltAlteracao", "id", "indBiometria", "indRendaPercap", "logradouro", "motSituacao", "municipio", "nis", "nomeCompleto", "nomeMae", "nomePai", "numCpf", "numDependentes", "numInscricao", "numVersao", "numero", "qtdMembrosFamilia", "rgDtExpedicao", "rgNumero", "rgOrgao", "rgUf", "sexo", "sitBeneficiario", "telCelular", "telFixo", "uf", "usrInclusao", "usrUltAlteracao", "vlrRendaFamiliar" FROM "Beneficiario";
DROP TABLE "Beneficiario";
ALTER TABLE "new_Beneficiario" RENAME TO "Beneficiario";
CREATE UNIQUE INDEX "Beneficiario_numCpf_key" ON "Beneficiario"("numCpf");
CREATE UNIQUE INDEX "Beneficiario_chavePublica_key" ON "Beneficiario"("chavePublica");
CREATE UNIQUE INDEX "Beneficiario_nis_key" ON "Beneficiario"("nis");
CREATE INDEX "Beneficiario_codPrograma_idx" ON "Beneficiario"("codPrograma");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
