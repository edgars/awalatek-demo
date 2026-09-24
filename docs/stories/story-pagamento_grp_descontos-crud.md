# Story — PagamentoGrpDescontos CRUD

**As an** operator, **I want** to manage PagamentoGrpDescontos records, **so that** the data stays current.

## Context

- Entity: `PagamentoGrpDesconto` (table `pagamento_grp_desconto`)
- Routes: list `/pagamento_grp_descontos`, create `/pagamento_grp_descontos/new`, edit `/pagamento_grp_descontos/[id]/edit`
- API base: `/api/pagamento_grp_descontos`

## Fields (render in order)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| tipoDesconto | Tipo Desconto | input | no | yes |
| vlrDesconto | Vlr Desconto | input | no | yes |
| pctDesconto | Pct Desconto | input | no | yes |
| numProcesso | Num Processo | input | no | yes |
| dtInicioDsct | Dt Inicio Dsct | input | no | yes |
| dtFimDsct | Dt Fim Dsct | input | no | yes |

## Acceptance criteria

- [ ] `GET /api/pagamento_grp_descontos` returns a paginated list.
- [ ] `POST /api/pagamento_grp_descontos` creates a record after validating the body.
- [ ] `GET /api/pagamento_grp_descontos/:id` returns one record.
- [ ] `PUT /api/pagamento_grp_descontos/:id` updates a record.
- [ ] `DELETE /api/pagamento_grp_descontos/:id` deletes a record.
- [ ] List page shows only *list column* fields, with search + pagination.
- [ ] Create and edit forms render all fields in order; required fields validated.
