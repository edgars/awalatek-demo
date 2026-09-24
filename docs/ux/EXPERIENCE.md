# UX — Experience & Flows

Every managed entity follows the same flow:

1. **List** — the user opens `/entity` and sees a table of records (only the *list column* fields), with search and pagination.
2. **Create** — the user clicks *New*, fills the form (all fields, in order), saves.
3. **Edit** — the user clicks a row, edits the prefilled form, saves or deletes.

## Per-entity routes

| Entity | List | Create | Edit |
|---|---|---|---|
| ProgramaSocials | `/programa_socials` | `/programa_socials/new` | `/programa_socials/[id]/edit` |
| ProgramaSocialGrpFaixaCalculos | `/programa_social_grp_faixa_calculos` | `/programa_social_grp_faixa_calculos/new` | `/programa_social_grp_faixa_calculos/[id]/edit` |
| ProgramaSocialGrpParamRegionals | `/programa_social_grp_param_regionals` | `/programa_social_grp_param_regionals/new` | `/programa_social_grp_param_regionals/[id]/edit` |
| Auditorias | `/auditorias` | `/auditorias/new` | `/auditorias/[id]/edit` |
| Beneficiarios | `/beneficiarios` | `/beneficiarios/new` | `/beneficiarios/[id]/edit` |
| BeneficiarioGrpDependentes | `/beneficiario_grp_dependentes` | `/beneficiario_grp_dependentes/new` | `/beneficiario_grp_dependentes/[id]/edit` |
| Pagamentos | `/pagamentos` | `/pagamentos/new` | `/pagamentos/[id]/edit` |
| PagamentoGrpDescontos | `/pagamento_grp_descontos` | `/pagamento_grp_descontos/new` | `/pagamento_grp_descontos/[id]/edit` |

