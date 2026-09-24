# Product Brief — SIFAP

## Visión general

SIFAP (Sistema de Fiscalização e Administração de Pagamentos) es un sistema
Natural/Adabas de mainframe que gestiona programas sociales de transferencia de
renta. RNC hizo ingeniería reversa de sus **15 programas** y **4 DDMs** y extrajo
**289 reglas de negocio**. El objetivo es reconstruirlo sobre un stack moderno y
soportado, con **equivalencia funcional**: mismos cálculos, mismos mensajes y
mismas validaciones, al centavo.

## Problema

El sistema corre sobre tecnología legada, cara de mantener y difícil de
evolucionar. Toda la lógica está repartida en programas monolíticos, con tablas
de cálculo fijas en el código y fechas y valores guardados como numéricos
legados. Además, el sistema tiene impacto social directo: paga beneficios a
ciudadanos vulnerables.

## Usuarios

Operadores de cadastro, analistas de beneficios, gestores financieros y
auditores. Hoy usan pantallas 3270 y jobs batch.

## Alcance: 7 dominios

1. **Programas sociales**: alta, consulta, tramos y parámetros regionales.
2. **Beneficiarios**: cadastro, validaciones, documentos, dependientes, descuentos registrados y consulta.
3. **Elegibilidad**: beneficiario × programa, con todos los motivos de rechazo.
4. **Cálculo y pagos**: motor único (factores regional, familiar, de renta y de edad; 13.º; abono), lote mensual y recálculo de descuentos.
5. **Corrección retroactiva**: por índice IPCA.
6. **Conciliación bancaria**: retorno CNAB 240.
7. **Informes y auditoría**: analítico de pagos, consolidado mensual y trilla de auditoría.

Las rarezas del legado se replican y quedan documentadas como decisiones
`LEGACY-QUIRK` (PRD §5).

## Fuera de alcance (fase 1)

- Migración de datos del Adabas.
- Remesa bancaria, integración SIAFI y biometría.
- Funcionalidades nuevas no presentes en el legado.

## Stack objetivo

Next.js (App Router) + Prisma + SQLite, desplegado con docker-compose.
