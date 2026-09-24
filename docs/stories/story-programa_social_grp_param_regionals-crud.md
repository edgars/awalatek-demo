# Story — ProgramaSocialGrpParamRegionals CRUD

**As an** operator, **I want** to manage ProgramaSocialGrpParamRegionals records, **so that** the data stays current.

## Context

- Entity: `ProgramaSocialGrpParamRegional` (table `programa_social_grp_param_regional`)
- Routes: list `/programa_social_grp_param_regionals`, create `/programa_social_grp_param_regionals/new`, edit `/programa_social_grp_param_regionals/[id]/edit`
- API base: `/api/programa_social_grp_param_regionals`

## Fields (render in order)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| codRegiao | Cod Regiao | input | no | yes |
| fatorRegional | Fator Regional | input | no | yes |
| vlrComplementoReg | Vlr Complemento Reg | input | no | yes |
| indAtivoRegiao | Ind Ativo Regiao | input | no | yes |

## Acceptance criteria

- [ ] `GET /api/programa_social_grp_param_regionals` returns a paginated list.
- [ ] `POST /api/programa_social_grp_param_regionals` creates a record after validating the body.
- [ ] `GET /api/programa_social_grp_param_regionals/:id` returns one record.
- [ ] `PUT /api/programa_social_grp_param_regionals/:id` updates a record.
- [ ] `DELETE /api/programa_social_grp_param_regionals/:id` deletes a record.
- [ ] List page shows only *list column* fields, with search + pagination.
- [ ] Create and edit forms render all fields in order; required fields validated.
