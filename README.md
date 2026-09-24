# SIFAP — Plano de Construção (método BMAD)

> **Este repositório não contém código de aplicação.** Ele é um **pacote de
> planejamento** — requisitos, telas, modelo de dados, regras de negócio e
> histórias de implementação — produzido por engenharia reversa de um sistema
> legado. Qualquer desenvolvedor, com **qualquer agente de AI coding**
> (Claude Code, Cursor, Windsurf, AWS Kiro, IBM Bob…), constrói a aplicação
> moderna seguindo estes documentos.

---

## 1. De onde isto veio

| | |
|---|---|
| **Sistema legado** | Engenharia reversa: 0 telas, 8 entidades, 289 regras de negócio extraídas |
| **Gerado por** | Plataforma **RNC**: código legado → UIR (representação intermediária) → documentos BMAD |
| **Stack alvo** | Frontend **nextjs** · Backend **nextjs + prisma** · Banco **sqlite** · **docker-compose** |
| **SSO** | desligado |

O método [BMAD](https://github.com/bmad-code-org) organiza um projeto em fases:
brief → PRD/UX → arquitetura/épicos → histórias. Aqui, **todas as fases de
planejamento já estão prontas** — derivadas do código legado, não escritas à
mão. Seu agente executa apenas o build.

---

## 2. Mapa do repositório — leia nesta ordem

```
README.md                    ← você está aqui (o "como usar")
bmad-context.md              ← ordens permanentes para o agente. Ele lê PRIMEIRO.
docs/
├── product-brief.md         ← o que o app é, em uma página
├── prd.md                   ← FONTE DE VERDADE: requisitos FR-nn + regras `RK-…`
├── ux/DESIGN.md             ← campos de cada tela
├── ux/EXPERIENCE.md         ← fluxos e rotas
├── architecture.md          ← stack, modelo de dados, deployment, auth, ADRs
├── epics/epic-*.md          ← um épico por entidade gerenciada
└── stories/                 ← trabalho implementável, um arquivo por vez
    ├── story-00-*           ← (se existir) implementar PRIMEIRO
    ├── story-<entidade>-crud.md
    └── story-zz-deployment.md ← implementar POR ÚLTIMO
```

**Quando documentos parecerem divergir**, a hierarquia é:
**1.** diretivas do autor (*"follow VERBATIM"*) → **2.** configuração explícita
→ **3.** decisões derivadas → **4.** defaults. Nunca "conserte" uma diretiva:
ela carrega intenção do arquiteto.

---

## 3. O domínio em um minuto

| Entidade | Colunas | Papel |
|---|---|---|
| `programa_social` | 29 | Gerenciada — CRUD completo em `/programa_socials` |
| `programa_social_grp_faixa_calculo` | 5 | Gerenciada — CRUD completo em `/programa_social_grp_faixa_calculos` |
| `programa_social_grp_param_regional` | 4 | Gerenciada — CRUD completo em `/programa_social_grp_param_regionals` |
| `auditoria` | 23 | Gerenciada — CRUD completo em `/auditorias` |
| `beneficiario` | 45 | Gerenciada — CRUD completo em `/beneficiarios` |
| `beneficiario_grp_dependente` | 6 | Gerenciada — CRUD completo em `/beneficiario_grp_dependentes` |
| `pagamento` | 39 | Gerenciada — CRUD completo em `/pagamentos` |
| `pagamento_grp_desconto` | 6 | Gerenciada — CRUD completo em `/pagamento_grp_descontos` |

Cada regra de negócio tem uma **chave estável** `RK-…` no PRD.
Ela identifica a regra para sempre e permite rastreá-la até o código-fonte original.

---

## 4. Getting started

Há duas rotas. A **Rota A** instala o método BMAD completo (agentes
especializados — Scrum Master, Dev, QA — dentro da sua ferramenta). A
**Rota B** usa qualquer agente de AI coding com um único prompt, sem instalar
nada. As duas produzem o mesmo app; a Rota A dá mais controle em projetos
longos, a Rota B é a mais rápida para começar.

### Rota A — método BMAD completo

**Pré-requisitos:** Node.js 20+, git, Docker + Docker Compose, e uma
ferramenta suportada (Claude Code, Cursor, Windsurf, VS Code + Copilot…).

**A.1 — Instale o BMAD na raiz deste repositório:**

```bash
npx bmad-method install
```

O instalador é interativo: confirme o diretório (a raiz deste repo), selecione
o módulo **BMM (BMad Method)** e marque a(s) ferramenta(s) que você usa. Ele
cria a pasta de configuração do BMAD e registra os agentes na sua ferramenta
(ex.: comandos `/bmad…` no Claude Code, rules no Cursor). Nada dos nossos
`docs/` é alterado — o pacote já segue o layout que o BMAD espera.

**A.2 — Configuração (1 minuto):** se o instalador perguntar pelo diretório de
documentos, aponte para `docs/`. PRD, arquitetura e histórias já existem —
**pule qualquer fluxo de planejamento** (brief/PRD/UX): essas fases já foram
produzidas pela RNC a partir do código legado.

**A.3 — Ordem de comandos:** abra sua ferramenta na raiz do repo e siga este
ciclo por história (os nomes exatos variam por versão do BMAD — carregue o
agente e digite `*help` para ver o menu numerado):

```
1. Carregue o agente DEV                     (ex.: /bmad:bmm:agents:dev)
2. Peça: implementar a primeira história      (ordem alfabética em docs/stories/)
3. O agente implementa e marca os acceptance criteria
4. Revise o diff; rode os testes da história
5. Próxima história — repita 2–4 até story-zz-deployment.md
```

Opcional, para times: use o agente **SM (Scrum Master)** antes de cada história
para gerar o *story context*, e o agente **QA/TEA** depois, para revisão — o
ciclo SM → Dev → QA do BMAD funciona por cima das nossas histórias sem
adaptação.

### Rota B — qualquer agente, sem instalação

Abra este repositório na sua ferramenta e cole:

> Leia `bmad-context.md` por inteiro e trate-o como instruções permanentes
> desta sessão. Depois leia `docs/prd.md` e `docs/architecture.md`. Construa a
> aplicação implementando as histórias de `docs/stories/` **uma por vez, em
> ordem alfabética** — a de autenticação primeiro se existir, a de deployment
> por último. Ao terminar cada história, verifique cada item dos *acceptance
> criteria* antes de avançar. Não invente stack, entidade ou campo que não
> esteja nos documentos. Recomendado: se sua ferramenta suportar MCP, conecte o
> **servidor MCP da RNC** e siga o protocolo de verificação descrito no
> `bmad-context.md`.

### Ao final (qualquer rota)

```bash
cp .env.example .env    # preencha as variáveis
docker compose up --build
```

App no ar: frontend nextjs, API nextjs, sqlite com volume persistente.

---

## 5. O protocolo de build

1. **Uma história por vez, na ordem.**
2. **O PRD é a fonte de verdade de comportamento.**
3. **`NEEDS REVIEW`** = regra ambígua no fonte: implemente a interpretação mais
   provável e deixe `// TODO(review): …`.
4. **Tabelas de referência não ganham CRUD** — só API read-only + dropdown,
   como no legado.
5. **"Legacy behaviors"** (impressões, conexões, diálogos) **não são
   requisitos** — confirme antes de portar.
6. **"Out of scope"** no PRD: não implemente.
7. **"Probable relations"** no architecture: sugestões derivadas — confirme
   antes de criar FK; o schema não as inclui de propósito.
8. **Campos NOT NULL sem default** sinalizados nas stories: resolva antes do
   primeiro insert.

---

## 6. Decisões pendentes deste projeto

Nenhuma pendência detectada automaticamente.

---

## 7. Problemas comuns

| Sintoma | Ação |
|---|---|
| Agente resumiu e pulou regras | Uma história por vez; recite as `RK-…` da história atual |
| Agente inventou tela/campo | Aponte a seção 5 e o `bmad-context.md`; peça diff contra o PRD |
| Documentos parecem se contradizer | Hierarquia da seção 2 |
| Dúvida sobre uma regra | Procure a `RK-…` no PRD (condição + campos afetados) |

---

*Gerado pela plataforma RNC. Formato: método BMAD
(https://github.com/bmad-code-org). Para regenerar, use o workspace de origem
na RNC.*
