---
name: Verification Loop (este proyecto)
description: Verificación de calidad y seguridad antes de commit en compras-proveedores. Usar tras completar un feature o refactor, antes de crear un commit o PR, o cuando se pida "verifica", "comprueba" o "está todo bien".
---

# Verification Loop en compras-proveedores

Gates exactos de este repo (Node 18+, npm). Ejecutar en orden; si uno falla, arreglar antes de continuar.

## 1. Build

```bash
npm run build   # expo export --platform web --output-dir dist
```

Si falla (o hay errores de tipo en el bundle), STOP y arreglar.

## 2. Types

```bash
npm run typecheck   # tsc --noEmit
```

Tolerancia cero. Hay dos tsconfigs: `tsconfig.json` (app) y `src/worker/tsconfig.json` (Worker) — el typecheck principal cubre la app.

## 3. Lint

```bash
npx expo lint
```

Si ESLint no está configurado, reportarlo como "N/A (no configurado)" — no instalar tooling sin consentimiento.

## 4. Tests

```bash
npm run test:coverage
```

- 2 proyectos Jest: app (`src/`) y worker (`src/worker/`), entorno jsdom.
- Coverage threshold global 80%. Fallar si algún proyecto baja del mínimo.
- Regla del proyecto: toda corrección de bug añade/alarga test de regresión en el archivo de tests correspondiente (`src/domain/__tests__/`, `src/hooks/__tests__/`, `src/worker/__tests__/`).

## 5. Seguridad

```bash
git status --short                      # .dev.vars JAMÁS staged
git grep -n -E "sk-[A-Za-z0-9]|api[_-]?key\s*=\s*['\"]" -- src
git grep -rn "console.log" -- src/worker # el Worker solo usa console.error/warn
npm audit --audit-level=high
```

- `.dev.vars` está en `.gitignore`: nunca commitearlo ni leer su contenido en respuestas.
- El Worker es la única zona con secretos; el bundle web no debe contener ninguno.

## 6. Diff review

```bash
git diff --stat
git diff
```

Leer el diff completo: ¿cambia comportamiento observable sin test? ¿¿añade dependencias nuevas? ¿toca `src/worker/validate.ts` (validar que el endpoint nuevo también valida server-side)?

## Salida

Informe PASS/FAIL con nº de tests, coverage y hallazgos. Solo entonces commit.

## Convenciones de commit

- Mensaje en español, convencional commit: `feat:`, `fix:`, `chore:`, `docs:`.
- Cuerpo detallando qué y por qué (ver historial `git log`).
- Nunca commitear artefactos (`dist/`, `.expo/`) ni `.dev.vars`.
