- source_spec: `_bmad-output/implementation-artifacts/spec-0-1-scaffold-del-proyecto-y-esquema-de-datos.md`
  summary: Normalizar `""` → `NULL` en `Beneficiario.nis` y `BeneficiarioDependente.cpfDependente` antes de grabar (unique sobre columna nullable).
  evidence: Con `""` el segundo registro sin NIS/CPF de dependiente viola el unique (P2002); primer escritor será E2 (historias 2.1/2.4).
- source_spec: `_bmad-output/implementation-artifacts/spec-0-1-scaffold-del-proyecto-y-esquema-de-datos.md`
  summary: Tests de constraints restantes — unique de `nis`, `numPagamento`, `numAuditoria`, `(beneficiarioId, cpfDependente)`; cascadas Programa→faixas/params y Pagamento→descontos; RESTRICT de Pagamento→Beneficiario.
  evidence: Hoy solo `numCpf` y la cascada de Beneficiario tienen test; quitar un `@unique`/`onDelete` y regenerar la migración no rompe ningún test.
- source_spec: `_bmad-output/implementation-artifacts/spec-0-1-scaffold-del-proyecto-y-esquema-de-datos.md`
  summary: Chequeo automático `prisma migrate diff --from-migrations prisma/migrations --to-schema prisma/schema.prisma --exit-code` en CI o como script.
  evidence: Esquema y migración coinciden hoy, pero nada lo verifica; un campo agregado sin migración fallaría recién en runtime.
- source_spec: `_bmad-output/implementation-artifacts/spec-0-1-scaffold-del-proyecto-y-esquema-de-datos.md`
  summary: Despliegue (historia 8.1) — `start` para output standalone (`node .next/standalone/server.js`), script `db:deploy` (`prisma migrate deploy`) y `postinstall prisma generate` compatible con `npm ci --omit=dev`.
  evidence: Con `--omit=dev` el CLI de prisma y dotenv no están instalados y el postinstall falla; `next start` no usa la salida standalone.
- source_spec: `_bmad-output/implementation-artifacts/spec-0-1-scaffold-del-proyecto-y-esquema-de-datos.md`
  summary: Base dedicada para e2e (migrate + seed en `globalSetup` o en el comando `webServer`) antes del primer e2e que lea datos (E1).
  evidence: El `webServer` de Playwright arranca `next dev` sin `DATABASE_URL` propia; hoy pasa porque la home no consulta la base (no verificado para E1).
