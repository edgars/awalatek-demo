# Story — ProgramaSocials CRUD

**As an** operator, **I want** to manage ProgramaSocials records, **so that** the data stays current.

## Context

- Entity: `ProgramaSocial` (table `programa_social`)
- Routes: list `/programa_socials`, create `/programa_socials/new`, edit `/programa_socials/[id]/edit`
- API base: `/api/programa_socials`

## Fields (render in order)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| codPrograma | Cod Programa | input | no | yes |
| nomePrograma | Nome Programa | input | no | yes |
| siglaPrograma | Sigla Programa | input | no | yes |
| tipoPrograma | Tipo Programa | input | no | yes |
| orgaoResponsavel | Orgao Responsavel | input | no | yes |
| leiCriacao | Lei Criacao | input | no | yes |
| dtCriacao | Dt Criacao | input | no | yes |
| dtEncerramento | Dt Encerramento | input | no | yes |
| sitPrograma | Sit Programa | input | no | yes |
| vlrBaseIndividual | Vlr Base Individual | input | no | yes |
| vlrBaseFamiliar | Vlr Base Familiar | input | no | yes |
| vlrTetoBenef | Vlr Teto Benef | input | no | yes |
| vlrPisoBenef | Vlr Piso Benef | input | no | yes |
| pctReajusteAnual | Pct Reajuste Anual | input | no | yes |
| dtUltReajuste | Dt Ult Reajuste | input | no | yes |
| fatorK | Fator K | input | no | yes |
| rendaMaxPercap | Renda Max Percap | input | no | yes |
| idadeMin | Idade Min | input | no | yes |
| idadeMax | Idade Max | input | no | yes |
| indExigeFilhos | Ind Exige Filhos | input | no | yes |
| qtdMinFilhos | Qtd Min Filhos | input | no | yes |
| indExigeEscola | Ind Exige Escola | input | no | yes |
| indExigeVacina | Ind Exige Vacina | input | no | yes |
| indExigePrenatal | Ind Exige Prenatal | input | no | yes |
| indExigeBiometria | Ind Exige Biometria | input | no | yes |
| dtInclusao | Dt Inclusao | input | no | yes |
| usrInclusao | Usr Inclusao | input | no | yes |
| dtUltAlteracao | Dt Ult Alteracao | input | no | yes |
| usrUltAlteracao | Usr Ult Alteracao | input | no | yes |

## Acceptance criteria

- [ ] `GET /api/programa_socials` returns a paginated list.
- [ ] `POST /api/programa_socials` creates a record after validating the body.
- [ ] `GET /api/programa_socials/:id` returns one record.
- [ ] `PUT /api/programa_socials/:id` updates a record.
- [ ] `DELETE /api/programa_socials/:id` deletes a record.
- [ ] List page shows only *list column* fields, with search + pagination.
- [ ] Create and edit forms render all fields in order; required fields validated.
