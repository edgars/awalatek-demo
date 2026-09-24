# Story — Auditorias CRUD

**As an** operator, **I want** to manage Auditorias records, **so that** the data stays current.

## Context

- Entity: `Auditoria` (table `auditoria`)
- Routes: list `/auditorias`, create `/auditorias/new`, edit `/auditorias/[id]/edit`
- API base: `/api/auditorias`

## Fields (render in order)

| Field | Label | Component | Required | List column |
|---|---|---|---|---|
| numAuditoria | Num Auditoria | input | no | yes |
| dtEvento | Dt Evento | input | no | yes |
| hrEvento | Hr Evento | input | no | yes |
| tsEvento | Ts Evento | input | no | yes |
| codAcao | Cod Acao | input | no | yes |
| codModulo | Cod Modulo | input | no | yes |
| desAcao | Des Acao | input | no | yes |
| tipoEntidade | Tipo Entidade | input | no | yes |
| idEntidade | Id Entidade | input | no | yes |
| numCpfAfetado | Num Cpf Afetado | input | no | yes |
| usrEvento | Usr Evento | input | no | yes |
| nomeUsuario | Nome Usuario | input | no | yes |
| codPerfil | Cod Perfil | input | no | yes |
| codLotacao | Cod Lotacao | input | no | yes |
| ipOrigem | Ip Origem | input | no | yes |
| idSessao | Id Sessao | input | no | yes |
| numCicloBatch | Num Ciclo Batch | input | no | yes |
| numSeqBatch | Num Seq Batch | input | no | yes |
| nomJobBatch | Nom Job Batch | input | no | yes |
| sitBatch | Sit Batch | input | no | yes |
| desErroBatch | Des Erro Batch | input | no | yes |
| idCorrelacao | Id Correlacao | input | no | yes |
| numSeqCorrelacao | Num Seq Correlacao | input | no | yes |

## Acceptance criteria

- [ ] `GET /api/auditorias` returns a paginated list.
- [ ] `POST /api/auditorias` creates a record after validating the body.
- [ ] `GET /api/auditorias/:id` returns one record.
- [ ] `PUT /api/auditorias/:id` updates a record.
- [ ] `DELETE /api/auditorias/:id` deletes a record.
- [ ] List page shows only *list column* fields, with search + pagination.
- [ ] Create and edit forms render all fields in order; required fields validated.
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: Conditional
- [ ] Enforce: DECIDE ON AUDITORIA-V.ACAO
- [ ] Enforce: Conditional
- [ ] If the RNC MCP server is connected: verified each rule above with `getRule` (see `bmad-context.md` § RNC MCP guardrail).
