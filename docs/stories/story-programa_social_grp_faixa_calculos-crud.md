# Story — ProgramaSocialGrpFaixaCalculos CRUD

**As an** operator, **I want** to manage ProgramaSocialGrpFaixaCalculos records, **so that** the data stays current.

## Context

- Entity: `ProgramaSocialGrpFaixaCalculo` (table `programa_social_grp_faixa_calculo`)
- Routes: list `/programa_social_grp_faixa_calculos`, create `/programa_social_grp_faixa_calculos/new`, edit `/programa_social_grp_faixa_calculos/[id]/edit`
- API base: `/api/programa_social_grp_faixa_calculos`

## Fields (render in order)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| rendaInicio | Renda Inicio | input | no | yes |
| rendaFim | Renda Fim | input | no | yes |
| fatorMultiplicador | Fator Multiplicador | input | no | yes |
| vlrAdicional | Vlr Adicional | input | no | yes |
| indAcumulativo | Ind Acumulativo | input | no | yes |

## Acceptance criteria

- [ ] `GET /api/programa_social_grp_faixa_calculos` returns a paginated list.
- [ ] `POST /api/programa_social_grp_faixa_calculos` creates a record after validating the body.
- [ ] `GET /api/programa_social_grp_faixa_calculos/:id` returns one record.
- [ ] `PUT /api/programa_social_grp_faixa_calculos/:id` updates a record.
- [ ] `DELETE /api/programa_social_grp_faixa_calculos/:id` deletes a record.
- [ ] List page shows only *list column* fields, with search + pagination.
- [ ] Create and edit forms render all fields in order; required fields validated.
