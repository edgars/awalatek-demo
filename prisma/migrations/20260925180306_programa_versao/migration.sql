-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProgramaSocial" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "codPrograma" TEXT NOT NULL,
    "nomePrograma" TEXT NOT NULL,
    "siglaPrograma" TEXT,
    "tipoPrograma" TEXT NOT NULL,
    "orgaoResponsavel" TEXT,
    "leiCriacao" TEXT,
    "dtCriacao" INTEGER NOT NULL,
    "dtEncerramento" INTEGER NOT NULL DEFAULT 0,
    "sitPrograma" TEXT NOT NULL DEFAULT 'A',
    "vlrBaseIndividual" INTEGER NOT NULL,
    "vlrBaseFamiliar" INTEGER,
    "vlrTetoBenef" INTEGER,
    "vlrPisoBenef" INTEGER,
    "fatorReajuste" TEXT NOT NULL,
    "pctReajusteAnual" TEXT,
    "dtUltReajuste" INTEGER,
    "fatorK" TEXT NOT NULL,
    "codElegibilidade" TEXT,
    "rendaMaxPercap" INTEGER NOT NULL DEFAULT 0,
    "idadeMin" INTEGER NOT NULL DEFAULT 0,
    "idadeMax" INTEGER NOT NULL DEFAULT 0,
    "indExigeFilhos" TEXT,
    "indExigeEscola" TEXT,
    "indExigeVacina" TEXT,
    "indExigePrenatal" TEXT,
    "indExigeBiometria" TEXT,
    "qtdMinFilhos" INTEGER,
    "tiposDescontoAplic" TEXT,
    "dtInclusao" INTEGER NOT NULL DEFAULT 0,
    "usrInclusao" TEXT NOT NULL DEFAULT '',
    "dtUltAlteracao" INTEGER NOT NULL DEFAULT 0,
    "usrUltAlteracao" TEXT NOT NULL DEFAULT '',
    "numVersao" INTEGER NOT NULL DEFAULT 1
);
INSERT INTO "new_ProgramaSocial" ("codElegibilidade", "codPrograma", "dtCriacao", "dtEncerramento", "dtInclusao", "dtUltAlteracao", "dtUltReajuste", "fatorK", "fatorReajuste", "id", "idadeMax", "idadeMin", "indExigeBiometria", "indExigeEscola", "indExigeFilhos", "indExigePrenatal", "indExigeVacina", "leiCriacao", "nomePrograma", "orgaoResponsavel", "pctReajusteAnual", "qtdMinFilhos", "rendaMaxPercap", "siglaPrograma", "sitPrograma", "tipoPrograma", "tiposDescontoAplic", "usrInclusao", "usrUltAlteracao", "vlrBaseFamiliar", "vlrBaseIndividual", "vlrPisoBenef", "vlrTetoBenef") SELECT "codElegibilidade", "codPrograma", "dtCriacao", "dtEncerramento", "dtInclusao", "dtUltAlteracao", "dtUltReajuste", "fatorK", "fatorReajuste", "id", "idadeMax", "idadeMin", "indExigeBiometria", "indExigeEscola", "indExigeFilhos", "indExigePrenatal", "indExigeVacina", "leiCriacao", "nomePrograma", "orgaoResponsavel", "pctReajusteAnual", "qtdMinFilhos", "rendaMaxPercap", "siglaPrograma", "sitPrograma", "tipoPrograma", "tiposDescontoAplic", "usrInclusao", "usrUltAlteracao", "vlrBaseFamiliar", "vlrBaseIndividual", "vlrPisoBenef", "vlrTetoBenef" FROM "ProgramaSocial";
DROP TABLE "ProgramaSocial";
ALTER TABLE "new_ProgramaSocial" RENAME TO "ProgramaSocial";
CREATE UNIQUE INDEX "ProgramaSocial_codPrograma_key" ON "ProgramaSocial"("codPrograma");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
