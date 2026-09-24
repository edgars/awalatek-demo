# Epic — Manage Beneficiarios

**Goal:** full lifecycle management of Beneficiarios records at `/beneficiarios`.

## Stories

- `story-beneficiarios-crud` — list, create, view, edit, delete Beneficiarios.

## Business rules affecting this entity

- Age calculation (#ANO-ATUAL - #ANO-NASC) — Calc Idade Benef
- Conditional
- DECIDE ON BENEFICIARIO-V.STATUS
- Conditional
- Conditional
- Conditional
- Derivation of #ANO-NASC — Calc Fator Idade
- Age calculation (#ANO - #ANO-NASC) — Calc Fator Idade
- Conditional
- Conditional
- Conditional
- Conditional
- Conditional
- Derivation of #ANO-NASC — Leitura Beneficiario - Arq 150
- Age calculation (#ANO-ATUAL - #ANO-NASC) — Leitura Beneficiario - Arq 150
- Conditional
- Conditional
- Conditional
- Conditional
- Conditional
- Conditional
- Conditional
- Derivation of #ANO-NASC — Preparar Dados P/ Calculo
- Age calculation (#ANO - #ANO-NASC) — Preparar Dados P/ Calculo
- Conditional
- Conditional
- Conditional
- Conditional
- Conditional
- Conditional
- Conditional
- Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Desconto Judicial - Valor Fixo Ou Percentual
- Conditional
- Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Pensao Alimenticia
- Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Imposto Retido
- Conditional
- Percentage calculation (PCT-DSCT% of #VLR-BRUTO) — Desconto Administrativo

## Definition of done

- CRUD works end to end; required fields validated; relations resolve; business rules enforced.
