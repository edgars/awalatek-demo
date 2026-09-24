# Story — Beneficiarios CRUD

**As an** operator, **I want** to manage Beneficiarios records, **so that** the data stays current.

## Context

- Entity: `Beneficiario` (table `beneficiario`)
- Routes: list `/beneficiarios`, create `/beneficiarios/new`, edit `/beneficiarios/[id]/edit`
- API base: `/api/beneficiarios`

## Fields (render in order)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| numInscricao | Num Inscricao | input | no | yes |
| numCpf | Num Cpf | input | no | yes |
| nomeCompleto | Nome Completo | input | no | yes |
| nomeMae | Nome Mae | input | no | yes |
| nomePai | Nome Pai | input | no | yes |
| dtNascimento | Dt Nascimento | input | no | yes |
| sexo | Sexo | input | no | yes |
| estCivil | Est Civil | input | no | yes |
| rgNumero | Rg Numero | input | no | yes |
| rgOrgao | Rg Orgao | input | no | yes |
| rgUf | Rg Uf | input | no | yes |
| rgDtExpedicao | Rg Dt Expedicao | input | no | yes |
| logradouro | Logradouro | input | no | yes |
| numero | Numero | input | no | yes |
| complemento | Complemento | input | no | yes |
| bairro | Bairro | input | no | yes |
| municipio | Municipio | input | no | yes |
| uf | Uf | input | no | yes |
| cep | Cep | input | no | yes |
| codIbge | Cod Ibge | input | no | yes |
| codRegiao | Cod Regiao | input | no | yes |
| codPrograma | Cod Programa | input | no | yes |
| dtCadastro | Dt Cadastro | input | no | yes |
| dtInicioBenef | Dt Inicio Benef | input | no | yes |
| dtFimBenef | Dt Fim Benef | input | no | yes |
| sitBeneficiario | Sit Beneficiario | input | no | yes |
| motSituacao | Mot Situacao | input | no | yes |
| dtUltSituacao | Dt Ult Situacao | input | no | yes |
| vlrRendaFamiliar | Vlr Renda Familiar | input | no | yes |
| qtdMembrosFamilia | Qtd Membros Familia | input | no | yes |
| indRendaPercap | Ind Renda Percap | input | no | yes |
| telFixo | Tel Fixo | input | no | yes |
| telCelular | Tel Celular | input | no | yes |
| email | Email | input | no | yes |
| indBiometria | Ind Biometria | input | no | yes |
| dtColetaBio | Dt Coleta Bio | input | no | yes |
| codPostoBio | Cod Posto Bio | input | no | yes |
| hashDigital | Hash Digital | input | no | yes |
| dtInclusao | Dt Inclusao | input | no | yes |
| hrInclusao | Hr Inclusao | input | no | yes |
| usrInclusao | Usr Inclusao | input | no | yes |
| dtUltAlteracao | Dt Ult Alteracao | input | no | yes |
| hrUltAlteracao | Hr Ult Alteracao | input | no | yes |
| usrUltAlteracao | Usr Ult Alteracao | input | no | yes |
| numVersao | Num Versao | input | no | yes |

## Acceptance criteria

- [ ] `GET /api/beneficiarios` returns a paginated list.
- [ ] `POST /api/beneficiarios` creates a record after validating the body.
- [ ] `GET /api/beneficiarios/:id` returns one record.
- [ ] `PUT /api/beneficiarios/:id` updates a record.
- [ ] `DELETE /api/beneficiarios/:id` deletes a record.
- [ ] List page shows only *list column* fields, with search + pagination.
- [ ] Create and edit forms render all fields in order; required fields validated.
- [ ] Enforce: Age calculation (#ANO-ATUAL - #ANO-NASC) — Calc Idade Benef
- [ ] Enforce: Conditional
- [ ] Enforce: DECIDE ON BENEFICIARIO-V.STATUS
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #ANO-NASC — Calc Fator Idade
- [ ] Enforce: Age calculation (#ANO - #ANO-NASC) — Calc Fator Idade
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #ANO-NASC — Leitura Beneficiario - Arq 150
- [ ] Enforce: Age calculation (#ANO-ATUAL - #ANO-NASC) — Leitura Beneficiario - Arq 150
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Derivation of #ANO-NASC — Preparar Dados P/ Calculo
- [ ] Enforce: Age calculation (#ANO - #ANO-NASC) — Preparar Dados P/ Calculo
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Desconto Judicial - Valor Fixo Ou Percentual
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Pensao Alimenticia
- [ ] Enforce: Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Imposto Retido
- [ ] Enforce: Conditional
- [ ] Enforce: Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Desconto Administrativo
- [ ] If the RNC MCP server is connected: verified each rule above with `getRule` (see `bmad-context.md` § RNC MCP guardrail).
