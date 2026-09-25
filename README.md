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
| **Sistema legado** | SIFAP — Natural/Adabas: 15 programas, 4 DDMs, 16 telas 3270, **289 regras** extraídas |
| **Workspace RNC** | `603f473c-d0aa-4d1a-bdb1-6e365371c787` (fonte retido; regras com chave `RK-`) |
| **Gerado por** | Plataforma **RNC**: código legado → UIR (representação intermediária) → documentos BMAD |
| **Stack alvo** | **Next.js** (UI + API) · **Prisma** · **SQLite** · **docker-compose** (1 serviço) |
| **SSO** | desligado |

O método [BMAD](https://github.com/bmad-code-org) organiza um projeto em fases:
brief → PRD/UX → arquitetura/épicos → histórias. Aqui, **todas as fases de
planejamento já estão prontas** — derivadas do código legado, não escritas à
mão. Seu agente executa apenas o build.

> **Correção de rumo (2026-09-24):** o pack original modelava o sistema como 8
> CRUDs genéricos. PRD, arquitetura, UX, épicos e histórias foram refeitos por
> **domínio/processo** a partir do UIR e do fonte legado — ver
> `_bmad-output/planning-artifacts/sprint-change-proposal-2026-09-24.md`.
> Documentos em `docs/` estão em espanhol; a interface do app é em pt-BR.

---

## 2. Mapa do repositório — leia nesta ordem

```
README.md                    ← você está aqui (o "como usar")
bmad-context.md              ← ordens permanentes para o agente. Ele lê PRIMEIRO.
docs/
├── product-brief.md         ← o que o app é, em uma página
├── prd.md                   ← FONTE DE VERDADE: 74 FR + 289 regras `RK-…` + decisões LEGACY-QUIRK (§5)
├── ux/DESIGN.md             ← 20 telas (campos, componentes, origem 3270)
├── ux/EXPERIENCE.md         ← navegação, fluxos e padrões de interação
├── architecture.md          ← stack, modelo de dados, processos, deployment, ADRs
├── epics/epic-N-*.md        ← 9 épicos por domínio (0 Fundação … 8 Deployment)
└── stories/N-M-*.md         ← 20 histórias, uma por vez, na ordem do sprint-status
_bmad-output/
├── planning-artifacts/      ← sprint change proposal
└── implementation-artifacts/sprint-status.yaml ← ordem e status das histórias
```

**Quando documentos parecerem divergir**, a hierarquia é:
**1.** diretivas do autor (*"follow VERBATIM"*) → **2.** configuração explícita
→ **3.** decisões derivadas → **4.** defaults. Nunca "conserte" uma diretiva:
ela carrega intenção do arquiteto.

---

## 3. O domínio em um minuto

| Épico | Programas legados | Papel |
|---|---|---|
| 0 Fundação | — | Esquema completo, utilitários (dinheiro, data AAAAMMDD, CPF mód. 11), auditoria |
| 1 Programas sociais | CADPROG | Inclusão/consulta + faixas de cálculo e parâmetros regionais |
| 2 Beneficiários | CADBENEF, VALBENEF, VALDOCS, CADDEPEND, CONSBENF | Cadastro, validações, dependentes, descontos, consulta |
| 3 Elegibilidade | VALELEG | Beneficiário × programa com todos os motivos |
| 4 Cálculo e pagamentos | CALCBENF, CALCDSCT, BATCHPGT | Motor único, cálculo individual, lote mensal, descontos |
| 5 Correção retroativa | CALCCORR | Correção por IPCA |
| 6 Conciliação bancária | BATCHCON | Retorno CNAB 240 |
| 7 Relatórios e auditoria | RELPGT, BATCHREL, RELAUDIT | Analítico, consolidado, trilha de auditoria |
| 8 Deployment | — | docker-compose |

`Pagamento` e `Auditoria` **não têm CRUD**: pagamentos nascem dos processos,
auditoria é só escrita pelo sistema. Cada regra tem uma **chave estável** `RK-…`
+ localização `PROGRAMA:linha`, rastreável até o fonte original.

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
2. Peça: implementar a próxima história        (ordem de sprint-status.yaml: 0-1 … 8-1)
3. O agente implementa e marca os acceptance criteria
4. Revise o diff; rode os testes da história
5. Próxima história — repita 2–4 até 8-1-deployment
```

Opcional, para times: use o agente **SM (Scrum Master)** antes de cada história
para gerar o *story context*, e o agente **QA/TEA** depois, para revisão — o
ciclo SM → Dev → QA do BMAD funciona por cima das nossas histórias sem
adaptação.

### Rota B — qualquer agente, sem instalação

Abra este repositório na sua ferramenta e cole:

> Leia `bmad-context.md` por inteiro e trate-o como instruções permanentes
> desta sessão. Depois leia `docs/prd.md` e `docs/architecture.md`. Construa a
> aplicação implementando as histórias de `docs/stories/` **uma por vez, na
> ordem de `_bmad-output/implementation-artifacts/sprint-status.yaml`** (0-1
> primeiro, 8-1 por último). Ao terminar cada história, verifique cada item dos *acceptance
> criteria* antes de avançar. Não invente stack, entidade ou campo que não
> esteja nos documentos. Recomendado: se sua ferramenta suportar MCP, conecte o
> **servidor MCP da RNC** e siga o protocolo de verificação descrito no
> `bmad-context.md`.

### Ao final (qualquer rota)

```bash
cp .env.example .env    # preencha as variáveis
docker compose up --build
```

App no ar: serviço único `app` (Next.js, porta 3000), SQLite no volume `sifap-data`.
Lote mensal: `docker compose run --rm app npm run lote:pagamentos`.
Detalhes na seção [Deployment](#deployment-docker-compose).

---

## Deployment (docker-compose)

ADR-007 (`docs/architecture.md` §7): um único serviço `app` — imagem multi-stage
(`Dockerfile`, Node 24, Next.js `output: "standalone"`, usuário não-root) — e a
base SQLite no volume nomeado `sifap-data`, montado em `/data`
(`DATABASE_URL=file:/data/sifap.db`, fixado no `docker-compose.yml`).

```bash
cp .env.example .env              # SIFAP_USER, LEGACY_DOC_ESPECIAL_ENABLED, SIFAP_PORT
docker compose up --build -d      # http://localhost:${SIFAP_PORT:-3000}
docker compose logs -f app
```

- **Arranque:** `docker-entrypoint.sh` executa `prisma migrate deploy` (com lock em
  `/data/.migrate.lock`) e depois `node server.js`. Se a migração falhar — ou `/data`
  não for gravável — o contêiner termina com erro (código ≠ 0); o compose reinicia no
  máximo 5 vezes (`restart: on-failure:5`).
- **Comandos avulsos também migram:** `docker compose run …` aplica as migrações
  pendentes antes do comando (funciona com o volume vazio). Para pular:
  `docker compose run --rm -e SKIP_MIGRATIONS=1 app …`. Ao atualizar a imagem, **pare o
  app antes** (`docker compose stop app`) e não rode comandos avulsos em paralelo com
  o `up` da versão nova.
- **Lote mensal (BATCHPGT):** `docker compose run --rm app npm run lote:pagamentos`
  — imprime o resumo; código de saída ≠ 0 em erro ou se já houver um lote em execução
  (web ou CLI: o cadeado fica na base, tabela `ProcessoLock`). `--data=AAAAMMDD`
  (`npm run lote:pagamentos -- --data=20260901`) fixa a data de execução; Ctrl+C /
  `docker stop` (SIGINT/SIGTERM) libera o cadeado antes de sair (código 130/143). Agendável pelo cron do host:

  ```cron
  0 6 1 * * cd /opt/sifap && docker compose run -T --rm app npm run lote:pagamentos >> /var/log/sifap-lote.log 2>&1
  ```

- **Cadeados do lote e da conciliação (runbook):** lote (web e CLI) e conciliação
  bancária rodam com exclusão entre processos (`ProcessoLock`, nomes `LOTE-PAGAMENTOS`
  e `CONCILIACAO`). Quem roda renova o cadeado a cada 100 beneficiários/linhas; se o
  perder, para com `LOTE INTERROMPIDO: CANDADO PERDIDO` /
  `CONCILIACAO INTERROMPIDA: CANDADO PERDIDO` e resumo parcial. Um cadeado órfão
  (processo morto com `kill -9`, queda do host) expira após `SIFAP_LOCK_EXPIRACAO_MIN`
  minutos (inteiro de 1 a 10080; padrão 120). Para liberar antes — **só com certeza de
  que nada está rodando** — e ver o que foi removido:

  ```bash
  npm run lock:liberar -- LOTE-PAGAMENTOS      # ou CONCILIACAO
  docker compose run --rm app npm run lock:liberar -- LOTE-PAGAMENTOS
  ```

  Depois, rode de novo o lote (os pagamentos já gerados na competência são ignorados)
  ou a conciliação (reaplica o arquivo; ver TODO(review) em `src/server/conciliacao.ts`).
- **Seed de demonstração (opcional, nunca automático):**
  `docker compose run --rm app npm run db:seed` (idempotente, dados fictícios).
- **Fuso horário:** `TZ=America/Sao_Paulo` na imagem e no compose (usado por `hoje()`).
- **Persistência:** `docker compose down` / `up` preservam os dados; só
  `docker compose down -v` apaga o volume `sifap-data` (nome fixo, sem prefixo de projeto).
- **Backup** (app parado, para uma cópia consistente do SQLite e dos arquivos `-wal`/`-shm`):

  ```bash
  docker compose stop app
  docker run --rm -v sifap-data:/data -v "$PWD:/backup" \
    busybox tar czf /backup/sifap-data-$(date +%Y%m%d).tgz -C /data .
  docker compose start app
  ```

- **Restauração** (pare o app; esvazie `/data`, inclusive `-wal`/`-shm`, antes de extrair;
  extraia como o usuário `node`, uid 1000, para manter o dono dos arquivos):

  ```bash
  docker compose stop app
  docker run --rm -u 1000:1000 -v sifap-data:/data -v "$PWD:/backup" busybox \
    sh -c 'rm -rf /data/* /data/.[!.]* && tar xzf /backup/sifap-data-AAAAMMDD.tgz -C /data'
  docker compose start app
  ```

- **Smoke test repetível:** `scripts/docker-smoke.sh [projeto] [porta]` (padrão
  `sifap-smoke 3300`) — build, `up`, HTTP 200 (inclusive `/conciliacao` e um stylesheet
  `/_next/static`), seed, lote com exit 0, migração inválida com exit ≠ 0 e persistência
  após `down`/`up`; usa um volume próprio (`<projeto>-data`) e remove só esse projeto
  ao final (`KEEP=1` para mantê-lo).

Fora do Docker (desenvolvimento/local, com o `.env` de `.env.example`):
`npm run db:deploy && npm run build && npm start` (`next start`; o servidor standalone
é usado só dentro da imagem).

**Esquema × migrações:** `npm run db:check` falha (código 2) se `prisma/schema.prisma`
tiver mudanças sem migração em `prisma/migrations`. Rode-o junto de
`npm run lint && npm test` antes de cada commit e como passo de CI; mudanças de esquema
entram sempre por `npx prisma migrate dev --name <nome>` (nunca editar migrações existentes).

---

## 5. O protocolo de build

1. **Uma história por vez, na ordem do sprint-status.**
2. **O PRD é a fonte de verdade de comportamento** — fórmulas, mensagens literais, efeitos.
3. **`LEGACY-QUIRK(Dn)`** = comportamento estranho do legado **replicado de propósito**
   (PRD §5). Não "corrija"; comente o ID no código.
4. **`TODO(review)`** = ponto que um humano precisa confirmar.
5. **Sem CRUD em `Pagamento` e `Auditoria`.**
6. **Grupos periódicos Adabas** (dependentes, descontos, faixas, parâmetros regionais)
   são tabelas filhas do registro pai.
7. **Dinheiro em centavos + truncamento mainframe** centralizado; nunca `float`.
8. **Motor de cálculo único** para cálculo individual e lote.
9. **Cada `RK-`** da história implementada em `src/domain` com comentário e teste.

---

## 6. Decisões pendentes deste projeto

| ID | Decisão | Dono |
|---|---|---|
| D4 | Ativar ou não o bypass de documentos por prefixo de CPF (`LEGACY_DOC_ESPECIAL_ENABLED`, padrão **false**) | Negócio / segurança |
| D17 | Renda > 9.999,99 no lote herda o fator do beneficiário anterior — bug a corrigir? | Negócio |
| D7 | Qualquer mudança na máscara de CPF exige aprovação da auditoria | Auditoria |

---

## 7. Problemas comuns

| Sintoma | Ação |
|---|---|
| Agente resumiu e pulou regras | Uma história por vez; recite as `RK-…` da tabela da história |
| Agente "corrigiu" um comportamento legado | Aponte o `LEGACY-QUIRK(Dn)` no PRD §5 |
| Agente inventou tela/campo | Aponte a seção 5 e o `bmad-context.md`; peça diff contra o PRD |
| Documentos parecem se contradizer | Hierarquia da seção 2 |
| Dúvida sobre uma regra | Procure a `RK-…` no Anexo A do PRD ou `getRule`/`getSourceFile` via MCP |

---

*Gerado pela plataforma RNC. Formato: método BMAD
(https://github.com/bmad-code-org). Para regenerar, use o workspace de origem
na RNC.*
