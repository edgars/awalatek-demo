# Product Brief — SIFAP

## Overview

SIFAP is a modernization of a legacy system that has been reverse-engineered by RNC. The system manages 8 core entities with create/read/update/delete workflows and enforces 289 extracted business rules. The goal is to rebuild this application on a modern, supported technology stack while maintaining functional equivalence.

## Problem Statement

The original application runs on legacy technology that is costly to maintain and difficult to evolve. A modern rebuild will reduce maintenance burden and enable future development.

## Target Users

Current operators of the legacy system. All existing data and workflows will be preserved to ensure continuity.

## Core Entities in Scope

The modernized system will manage the following 8 entities:

1. **ProgramaSocials** (`/programa_socials`)
2. **ProgramaSocialGrpFaixaCalculos** (`/programa_social_grp_faixa_calculos`)
3. **ProgramaSocialGrpParamRegionals** (`/programa_social_grp_param_regionals`)
4. **Auditorias** (`/auditorias`)
5. **Beneficiarios** (`/beneficiarios`)
6. **BeneficiarioGrpDependentes** (`/beneficiario_grp_dependentes`)
7. **Pagamentos** (`/pagamentos`)
8. **PagamentoGrpDescontos** (`/pagamento_grp_descontos`)

Each entity will support full CRUD operations and enforce the 289 business rules extracted from the legacy system.

## Out of Scope (Phase 1)

- Data migration from the legacy database
- New features not present in the legacy system

## Target Technology Stack

- **Frontend:** Next.js
- **Backend:** Next.js + Prisma
- **Database:** SQLite