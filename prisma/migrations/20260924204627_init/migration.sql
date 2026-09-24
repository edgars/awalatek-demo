-- CreateTable
CREATE TABLE "ProgramaSocial" (
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
    "usrUltAlteracao" TEXT NOT NULL DEFAULT ''
);

-- CreateTable
CREATE TABLE "ProgramaFaixaCalculo" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "programaId" INTEGER NOT NULL,
    "occurrence" INTEGER NOT NULL,
    "rendaInicio" INTEGER NOT NULL,
    "rendaFim" INTEGER NOT NULL,
    "vlrAdicional" INTEGER NOT NULL,
    "fatorMultiplicador" TEXT NOT NULL,
    "indAcumulativo" TEXT NOT NULL,
    CONSTRAINT "ProgramaFaixaCalculo_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "ProgramaSocial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ProgramaParamRegional" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "programaId" INTEGER NOT NULL,
    "occurrence" INTEGER NOT NULL,
    "codRegiao" INTEGER NOT NULL,
    "fatorRegional" TEXT NOT NULL,
    "vlrComplementoReg" INTEGER NOT NULL,
    "indAtivoRegiao" TEXT NOT NULL,
    CONSTRAINT "ProgramaParamRegional_programaId_fkey" FOREIGN KEY ("programaId") REFERENCES "ProgramaSocial" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Beneficiario" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numCpf" TEXT NOT NULL,
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

-- CreateTable
CREATE TABLE "BeneficiarioDependente" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "beneficiarioId" INTEGER NOT NULL,
    "occurrence" INTEGER NOT NULL,
    "nomeDependente" TEXT NOT NULL,
    "dtNascDepend" INTEGER NOT NULL,
    "parentesco" TEXT NOT NULL,
    "cpfDependente" TEXT,
    "docDependente" TEXT,
    "sexoDependente" TEXT,
    "sitDependente" TEXT,
    "indDeficiencia" TEXT,
    CONSTRAINT "BeneficiarioDependente_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "Beneficiario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "BeneficiarioDesconto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "beneficiarioId" INTEGER NOT NULL,
    "occurrence" INTEGER NOT NULL,
    "tipoDesconto" TEXT NOT NULL,
    "vlrDesconto" INTEGER NOT NULL,
    "pctDesconto" TEXT NOT NULL,
    "dtInicioDsct" INTEGER NOT NULL,
    "dtFimDsct" INTEGER NOT NULL DEFAULT 0,
    "numProcesso" TEXT,
    CONSTRAINT "BeneficiarioDesconto_beneficiarioId_fkey" FOREIGN KEY ("beneficiarioId") REFERENCES "Beneficiario" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Pagamento" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numPagamento" INTEGER NOT NULL,
    "numCpf" TEXT NOT NULL,
    "numInscricao" INTEGER,
    "codPrograma" TEXT NOT NULL,
    "anoMesRef" INTEGER NOT NULL,
    "numCiclo" INTEGER,
    "vlrBruto" INTEGER NOT NULL,
    "vlrLiquido" INTEGER NOT NULL,
    "vlrDescontoTotal" INTEGER NOT NULL DEFAULT 0,
    "vlrAbono" INTEGER NOT NULL DEFAULT 0,
    "tipoPgto" TEXT NOT NULL DEFAULT 'N',
    "sitPagamento" TEXT NOT NULL,
    "dtGeracao" INTEGER NOT NULL,
    "hrGeracao" INTEGER NOT NULL,
    "dtPagamento" INTEGER,
    "codBanco" TEXT,
    "codRetornoBanco" TEXT,
    "vlrCorrecao" INTEGER,
    "dtCorrecao" INTEGER,
    "indCorrigido" TEXT,
    "dtEmissao" INTEGER,
    "dtConfirmacao" INTEGER,
    "dtCancelamento" INTEGER,
    "motCancelamento" TEXT,
    "codAgencia" TEXT,
    "numConta" TEXT,
    "tipoConta" TEXT,
    "codOperacao" TEXT,
    "numObSiafi" TEXT,
    "numNeSiafi" TEXT,
    "codUgEmitente" TEXT,
    "codGestao" TEXT,
    "sitIntegSiafi" TEXT,
    "dtConciliacao" INTEGER,
    "sitConciliacao" TEXT,
    "vlrConciliado" INTEGER,
    "desRetornoBanco" TEXT,
    "hashArqRemessa" TEXT,
    "hashArqRetorno" TEXT,
    "dtInclusao" INTEGER NOT NULL DEFAULT 0,
    "hrInclusao" INTEGER NOT NULL DEFAULT 0,
    "usrInclusao" TEXT NOT NULL DEFAULT '',
    "dtUltAlteracao" INTEGER NOT NULL DEFAULT 0,
    "hrUltAlteracao" INTEGER NOT NULL DEFAULT 0,
    "usrUltAlteracao" TEXT NOT NULL DEFAULT '',
    CONSTRAINT "Pagamento_numCpf_fkey" FOREIGN KEY ("numCpf") REFERENCES "Beneficiario" ("numCpf") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "PagamentoDesconto" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "pagamentoId" INTEGER NOT NULL,
    "occurrence" INTEGER NOT NULL,
    "tipoDesconto" TEXT NOT NULL,
    "vlrDesconto" INTEGER NOT NULL,
    "pctDesconto" TEXT NOT NULL,
    "numProcesso" TEXT,
    "dtInicioDsct" INTEGER NOT NULL,
    "dtFimDsct" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "PagamentoDesconto_pagamentoId_fkey" FOREIGN KEY ("pagamentoId") REFERENCES "Pagamento" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Auditoria" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "numAuditoria" INTEGER NOT NULL,
    "dtEvento" INTEGER NOT NULL,
    "hrEvento" INTEGER NOT NULL,
    "codAcao" TEXT NOT NULL,
    "tipoEntidade" TEXT NOT NULL,
    "idEntidade" TEXT NOT NULL,
    "usrEvento" TEXT NOT NULL,
    "desAcao" TEXT NOT NULL,
    "valorAnterior" TEXT,
    "valorPosterior" TEXT,
    "tsEvento" TEXT,
    "codModulo" TEXT,
    "numCpfAfetado" TEXT,
    "nomeUsuario" TEXT,
    "codPerfil" TEXT,
    "codLotacao" TEXT,
    "ipOrigem" TEXT,
    "idSessao" TEXT,
    "numCicloBatch" INTEGER,
    "numSeqBatch" INTEGER,
    "nomJobBatch" TEXT,
    "sitBatch" TEXT,
    "desErroBatch" TEXT,
    "idCorrelacao" TEXT,
    "numSeqCorrelacao" INTEGER
);

-- CreateIndex
CREATE UNIQUE INDEX "ProgramaSocial_codPrograma_key" ON "ProgramaSocial"("codPrograma");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramaFaixaCalculo_programaId_occurrence_key" ON "ProgramaFaixaCalculo"("programaId", "occurrence");

-- CreateIndex
CREATE UNIQUE INDEX "ProgramaParamRegional_programaId_occurrence_key" ON "ProgramaParamRegional"("programaId", "occurrence");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiario_numCpf_key" ON "Beneficiario"("numCpf");

-- CreateIndex
CREATE UNIQUE INDEX "Beneficiario_nis_key" ON "Beneficiario"("nis");

-- CreateIndex
CREATE INDEX "Beneficiario_codPrograma_idx" ON "Beneficiario"("codPrograma");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiarioDependente_beneficiarioId_occurrence_key" ON "BeneficiarioDependente"("beneficiarioId", "occurrence");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiarioDependente_beneficiarioId_cpfDependente_key" ON "BeneficiarioDependente"("beneficiarioId", "cpfDependente");

-- CreateIndex
CREATE UNIQUE INDEX "BeneficiarioDesconto_beneficiarioId_occurrence_key" ON "BeneficiarioDesconto"("beneficiarioId", "occurrence");

-- CreateIndex
CREATE UNIQUE INDEX "Pagamento_numPagamento_key" ON "Pagamento"("numPagamento");

-- CreateIndex
CREATE INDEX "Pagamento_numCpf_anoMesRef_idx" ON "Pagamento"("numCpf", "anoMesRef");

-- CreateIndex
CREATE UNIQUE INDEX "PagamentoDesconto_pagamentoId_occurrence_key" ON "PagamentoDesconto"("pagamentoId", "occurrence");

-- CreateIndex
CREATE UNIQUE INDEX "Auditoria_numAuditoria_key" ON "Auditoria"("numAuditoria");

-- CreateIndex
CREATE INDEX "Auditoria_dtEvento_idx" ON "Auditoria"("dtEvento");
