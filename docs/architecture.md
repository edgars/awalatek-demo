# Architecture — SIFAP

## Stack

- Frontend: nextjs
- Backend: nextjs + prisma
- Database: sqlite

## Deployment — docker-compose

Ship a single `docker-compose.yml` at the repo root:

- One service per architecture component: frontend (`web`), backend (`api`), database (`db`, engine sqlite).
- Use each component's port as configured on the canvas (frontend default 3000, API default 5000, database engine default). A component directive that names a port wins over these defaults.
- The database gets a named volume so data survives `docker compose down`.
- Services reference each other by service name (`api`, `db`) — never `localhost`.
- All secrets and connection strings come from `.env` (documented in `.env.example`).
- Multi-stage Dockerfiles per app service; production images run the built app, not a dev server.

## Data model

### ProgramaSocial (`programa_social`)

| Column | Type | Nullable |
|---|---|---|
| id | Int (PK, auto) | no |
| codPrograma | String? | yes |
| nomePrograma | String? | yes |
| siglaPrograma | String? | yes |
| tipoPrograma | String? | yes |
| orgaoResponsavel | String? | yes |
| leiCriacao | String? | yes |
| dtCriacao | Float? | yes |
| dtEncerramento | Float? | yes |
| sitPrograma | String? | yes |
| vlrBaseIndividual | Float? | yes |
| vlrBaseFamiliar | Float? | yes |
| vlrTetoBenef | Float? | yes |
| vlrPisoBenef | Float? | yes |
| pctReajusteAnual | Float? | yes |
| dtUltReajuste | Float? | yes |
| fatorK | Float? | yes |
| rendaMaxPercap | Float? | yes |
| idadeMin | Float? | yes |
| idadeMax | Float? | yes |
| indExigeFilhos | String? | yes |
| qtdMinFilhos | Float? | yes |
| indExigeEscola | String? | yes |
| indExigeVacina | String? | yes |
| indExigePrenatal | String? | yes |
| indExigeBiometria | String? | yes |
| dtInclusao | Float? | yes |
| usrInclusao | String? | yes |
| dtUltAlteracao | Float? | yes |
| usrUltAlteracao | String? | yes |

### ProgramaSocialGrpFaixaCalculo (`programa_social_grp_faixa_calculo`)

| Column | Type | Nullable |
|---|---|---|
| id | Int (PK, auto) | no |
| rendaInicio | Float? | yes |
| rendaFim | Float? | yes |
| fatorMultiplicador | Float? | yes |
| vlrAdicional | Float? | yes |
| indAcumulativo | String? | yes |

### ProgramaSocialGrpParamRegional (`programa_social_grp_param_regional`)

| Column | Type | Nullable |
|---|---|---|
| id | Int (PK, auto) | no |
| codRegiao | String? | yes |
| fatorRegional | Float? | yes |
| vlrComplementoReg | Float? | yes |
| indAtivoRegiao | String? | yes |

### Auditoria (`auditoria`)

| Column | Type | Nullable |
|---|---|---|
| id | Int (PK, auto) | no |
| numAuditoria | Float? | yes |
| dtEvento | Float? | yes |
| hrEvento | Float? | yes |
| tsEvento | Float? | yes |
| codAcao | String? | yes |
| codModulo | String? | yes |
| desAcao | String? | yes |
| tipoEntidade | String? | yes |
| idEntidade | String? | yes |
| numCpfAfetado | String? | yes |
| usrEvento | String? | yes |
| nomeUsuario | String? | yes |
| codPerfil | String? | yes |
| codLotacao | String? | yes |
| ipOrigem | String? | yes |
| idSessao | String? | yes |
| numCicloBatch | Float? | yes |
| numSeqBatch | Float? | yes |
| nomJobBatch | String? | yes |
| sitBatch | String? | yes |
| desErroBatch | String? | yes |
| idCorrelacao | String? | yes |
| numSeqCorrelacao | Float? | yes |

### Beneficiario (`beneficiario`)

| Column | Type | Nullable |
|---|---|---|
| id | Int (PK, auto) | no |
| numInscricao | Float? | yes |
| numCpf | String? | yes |
| nomeCompleto | String? | yes |
| nomeMae | String? | yes |
| nomePai | String? | yes |
| dtNascimento | Float? | yes |
| sexo | String? | yes |
| estCivil | String? | yes |
| rgNumero | String? | yes |
| rgOrgao | String? | yes |
| rgUf | String? | yes |
| rgDtExpedicao | Float? | yes |
| logradouro | String? | yes |
| numero | String? | yes |
| complemento | String? | yes |
| bairro | String? | yes |
| municipio | String? | yes |
| uf | String? | yes |
| cep | Float? | yes |
| codIbge | Float? | yes |
| codRegiao | String? | yes |
| codPrograma | String? | yes |
| dtCadastro | Float? | yes |
| dtInicioBenef | Float? | yes |
| dtFimBenef | Float? | yes |
| sitBeneficiario | String? | yes |
| motSituacao | String? | yes |
| dtUltSituacao | Float? | yes |
| vlrRendaFamiliar | Float? | yes |
| qtdMembrosFamilia | Float? | yes |
| indRendaPercap | Float? | yes |
| telFixo | String? | yes |
| telCelular | String? | yes |
| email | String? | yes |
| indBiometria | String? | yes |
| dtColetaBio | Float? | yes |
| codPostoBio | String? | yes |
| hashDigital | String? | yes |
| dtInclusao | Float? | yes |
| hrInclusao | Float? | yes |
| usrInclusao | String? | yes |
| dtUltAlteracao | Float? | yes |
| hrUltAlteracao | Float? | yes |
| usrUltAlteracao | String? | yes |
| numVersao | Float? | yes |

### BeneficiarioGrpDependente (`beneficiario_grp_dependente`)

| Column | Type | Nullable |
|---|---|---|
| id | Int (PK, auto) | no |
| cpfDependente | String? | yes |
| nomeDependente | String? | yes |
| dtNascDepend | Float? | yes |
| parentesco | String? | yes |
| sitDependente | String? | yes |
| indDeficiencia | String? | yes |

### Pagamento (`pagamento`)

| Column | Type | Nullable |
|---|---|---|
| id | Int (PK, auto) | no |
| numPagamento | Float? | yes |
| numCpf | String? | yes |
| numInscricao | Float? | yes |
| codPrograma | String? | yes |
| anoMesRef | Float? | yes |
| numCiclo | Float? | yes |
| vlrBruto | Float? | yes |
| vlrLiquido | Float? | yes |
| vlrDescontoTotal | Float? | yes |
| sitPagamento | String? | yes |
| dtGeracao | Float? | yes |
| hrGeracao | Float? | yes |
| dtEmissao | Float? | yes |
| dtConfirmacao | Float? | yes |
| dtCancelamento | Float? | yes |
| motCancelamento | String? | yes |
| codBanco | String? | yes |
| codAgencia | String? | yes |
| numConta | String? | yes |
| tipoConta | String? | yes |
| codOperacao | String? | yes |
| numObSiafi | String? | yes |
| numNeSiafi | String? | yes |
| codUgEmitente | String? | yes |
| codGestao | String? | yes |
| sitIntegSiafi | String? | yes |
| dtConciliacao | Float? | yes |
| sitConciliacao | String? | yes |
| vlrConciliado | Float? | yes |
| codRetornoBanco | String? | yes |
| desRetornoBanco | String? | yes |
| hashArqRemessa | String? | yes |
| hashArqRetorno | String? | yes |
| dtInclusao | Float? | yes |
| hrInclusao | Float? | yes |
| usrInclusao | String? | yes |
| dtUltAlteracao | Float? | yes |
| hrUltAlteracao | Float? | yes |
| usrUltAlteracao | String? | yes |

### PagamentoGrpDesconto (`pagamento_grp_desconto`)

| Column | Type | Nullable |
|---|---|---|
| id | Int (PK, auto) | no |
| tipoDesconto | String? | yes |
| vlrDesconto | Float? | yes |
| pctDesconto | Float? | yes |
| numProcesso | String? | yes |
| dtInicioDsct | Float? | yes |
| dtFimDsct | Float? | yes |

## Probable relations (derived — confirm before enforcing)

The legacy store declares no foreign keys. These column-name matches suggest joins; confirm against the legacy code (or via the RNC MCP tools) before adding constraints. The generated schema does NOT include them.

- **ProgramaSocial** ↔ **Beneficiario** share `codPrograma`, `dtInclusao`, `usrInclusao`, `dtUltAlteracao`, `usrUltAlteracao` — probably joined on them in the legacy code.
- **ProgramaSocial** ↔ **Pagamento** share `codPrograma`, `dtInclusao`, `usrInclusao`, `dtUltAlteracao`, `usrUltAlteracao` — probably joined on them in the legacy code.
- **ProgramaSocialGrpParamRegional** ↔ **Beneficiario** share `codRegiao` — probably joined on it in the legacy code.
- **Beneficiario** ↔ **Pagamento** share `numCpf`, `numInscricao`, `codPrograma`, `dtInclusao`, `hrInclusao`, `usrInclusao`, `dtUltAlteracao`, `hrUltAlteracao`, `usrUltAlteracao` — probably joined on them in the legacy code.

## Architecture Decision Records

### ADR-001 — Target stack

**Decision:** build on nextjs / nextjs / sqlite.
**Why:** chosen in the RNC Architecture Canvas as a supported, modern replacement for the legacy stack.

### ADR-002 — One module per managed entity

**Decision:** each managed entity gets its own route group, API, validation schema and pages.
**Why:** mirrors the legacy screen-per-entity structure and keeps the app navigable.

### ADR-003 — Reference tables are lookups, not screens

**Decision:** a table with no legacy edit screen gets only a read-only list API and is rendered as a dropdown inside the entities that reference it; the foreign key stores the related record's id.
**Why:** reproduces the legacy lookup behavior without inventing CRUD the original app never had.

### ADR-004 — Author directives override derived values

**Decision:** any *Component directive* or *Global directive* in this pack was written by the architecture author and wins over any value the generator derived (ports, versions, libraries, wiring).
**Why:** directives carry intent the canvas form fields cannot express; they are reproduced verbatim precisely so nothing is lost in translation.
