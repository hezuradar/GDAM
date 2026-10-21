---
name: Commit y Push (este proyecto)
description: Cerrar cualquier cambio de compras-proveedores verificándolo, commiteándolo en español (conventional commits) y subiéndolo a main. Usar como último paso de cada feature, corrección o refactorización, o cuando se pida "sube los cambios", "confirma", "commit", "publica" o "push".
---

# Commit y Push en compras-proveedores

Deja el repo como estaba: verde, commiteado y subido a `main`. Es el último paso de cualquier tarea de código de este repo.

## 1. Estado del repo

```bash
git status --short                 # qué hay sin commitear
git branch --show-current          # debe ser main
git fetch origin
git log --oneline origin/main..HEAD   # commits locales sin subir
```

- Si la rama no es `main`: no cambiar de rama. Commitea en la actual y avisa en el informe final.
- Si ya hay commits locales sin subir de antes: súbelos primero (paso 6) y sigue.

## 2. Gates (en orden; si uno falla, arreglar y volver a empezar aquí)

```bash
npm run typecheck        # tsc --noEmit + worker + tests
npm run test:coverage    # 2 proyectos Jest, coverage ≥ 80 %
npm run build            # expo export --platform web
```

**Nunca commitear con un gate en rojo.** Estos son los mínimos; si la tarea tocó `src/worker/`, migraciones o dependencias, añade los gates de `verification-loop` (seguridad y diff review).

## 3. Qué se commitea

```bash
git status --short      # revisar ANTES de añadir
git add -A
git diff --cached --stat
git diff --cached        # leer el diff completo
```

- `git add -A` recoge borrados y renombrados: úsalo, pero solo después de revisar que `git status --short` **no** muestra `.dev.vars`, `dist/`, `.expo/` ni `.wrangler/` (están en `.gitignore`; si alguno aparece, es un `.gitignore` roto: para y avisa).
- Un commit = una unidad de trabajo. Si el diff mezcla dos cosas sin relación, separa en dos commits.
- Cambios de schema: la migración (`migrations/00NN_*.sql`) va en el mismo commit que el código que la usa.

## 4. Mensaje

Español, conventional commit. Primera línea en imperativo, minúsculas, ≤ 72 caracteres. Cuerpo de 3-8 líneas explicando **qué** y **por qué** (ver el historial con `git log`).

| Cambio | Prefijo |
|---|---|
| Funcionalidad nueva | `feat:` |
| Corrección de bug | `fix:` |
| Reestructuración sin cambio de comportamiento | `refactor:` |
| Tests | `test:` |
| Documentación (skills, README, AGENTS.md) | `docs:` |
| Tooling, config, deps, migraciones sin comportamiento | `chore:` |

Sin emojis, sin "Cambios:", sin referencias a la IA.

## 5. Commit en Windows (PowerShell)

`tail` no existe en PowerShell: usa `git log --oneline -5 | Select-Object -Last 5`.

Para un mensaje multilínea, escríbelo en un archivo temporal y usa `-F` (evita los corchetes y comillas de PowerShell):

```powershell
$msg = @'
fix: explicar qué se corrigió

Cuerpo: qué cambia y por qué.
'@
$msg | Out-File -FilePath "$env:TEMP\commit-msg.txt" -Encoding utf8
git commit -F "$env:TEMP\commit-msg.txt"
```

Los avisos `LF will be replaced by CRLF` son normales en Windows: no son errores.

Nunca `git commit --amend` sobre `main` (historial compartido) ni `git reset --hard` para "arreglar" un commit.

## 6. Push

```bash
git push origin main
```

- Si el push es rechazado por divergencia:
  ```bash
  git pull --rebase origin main
  ```
  Vuelve a pasar los gates del paso 2 (el rebase puede cambiar el código) y reintenta el push.
- **Nunca** `git push --force` sobre `main`.
- `main` es la rama de publicación: el push es lo que despliega.

## 7. Confirmación

```bash
git status --short          # debe quedar vacío
git log --oneline -1
git log --oneline origin/main -1   # el mismo hash
```

Informe final: hash del commit, rama, gates ejecutados con su resultado y confirmación del push. Si algo no se pudo completar (gate en rojo, push rechazado, rama distinta de `main`), dilo explícitamente en vez de dar por hecho que está subido.
