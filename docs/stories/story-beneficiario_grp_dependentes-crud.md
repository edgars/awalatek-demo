# Story — BeneficiarioGrpDependentes CRUD

**As an** operator, **I want** to manage BeneficiarioGrpDependentes records, **so that** the data stays current.

## Context

- Entity: `BeneficiarioGrpDependente` (table `beneficiario_grp_dependente`)
- Routes: list `/beneficiario_grp_dependentes`, create `/beneficiario_grp_dependentes/new`, edit `/beneficiario_grp_dependentes/[id]/edit`
- API base: `/api/beneficiario_grp_dependentes`

## Fields (render in order)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| cpfDependente | Cpf Dependente | input | no | yes |
| nomeDependente | Nome Dependente | input | no | yes |
| dtNascDepend | Dt Nasc Depend | input | no | yes |
| parentesco | Parentesco | input | no | yes |
| sitDependente | Sit Dependente | input | no | yes |
| indDeficiencia | Ind Deficiencia | input | no | yes |

## Acceptance criteria

- [ ] `GET /api/beneficiario_grp_dependentes` returns a paginated list.
- [ ] `POST /api/beneficiario_grp_dependentes` creates a record after validating the body.
- [ ] `GET /api/beneficiario_grp_dependentes/:id` returns one record.
- [ ] `PUT /api/beneficiario_grp_dependentes/:id` updates a record.
- [ ] `DELETE /api/beneficiario_grp_dependentes/:id` deletes a record.
- [ ] List page shows only *list column* fields, with search + pagination.
- [ ] Create and edit forms render all fields in order; required fields validated.
