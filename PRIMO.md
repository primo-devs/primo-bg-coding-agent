# Primo Fork Guide

Este repo es un fork de
[ColeMurray/background-agents](https://github.com/ColeMurray/background-agents). Para que los syncs
con upstream sean baratos, todos los cambios propios de Primo viven en archivos separados o detrás
de hooks puntuales en archivos upstream. Este documento explica qué tocamos, dónde, y cómo extender
el fork sin sumar drift.

## Filosofía

1. **Minimizar diffs contra upstream.** Cada línea modificada en un archivo de upstream es una
   potencial fuente de conflict en el próximo sync.
2. **Archivos nuevos > líneas modificadas.** Si podés ponerlo en un archivo nuevo (overlay, módulo,
   workflow propio), hacelo.
3. **Hooks de una línea.** Cuando hay que tocar un archivo upstream, hacelo en una sola línea
   (import + llamada) que delegue a un archivo nuestro.
4. **Configuración por variables.** Si upstream hardcodea algo que necesitamos parametrizar,
   agregamos una variable de Terraform y dejamos el valor default igual al de upstream — así el
   cambio es nominal y no semántico.

## Inventario de cambios

### Archivos 100% nuestros

- **`packages/modal-infra/src/images/primo_overlay.py`** — instalaciones extra en la base image del
  sandbox: Go toolchain, AWS CLI v2, `postgresql-client`, y un `PATH` que incluye
  `/usr/local/go/bin`. Expone `apply_primo_overlay(image)`.
- **`.github/workflows/sync-upstream.yml`** — workflow diario que mergea `upstream/main` y abre un
  PR con auto-merge si no hay conflicts. Ver [sync-upstream](#sync-con-upstream).

### Hooks mínimos en archivos upstream

- **`packages/modal-infra/src/images/base.py`** — 2 líneas:
  `from .primo_overlay import apply_primo_overlay` y `apply_primo_overlay(base_image)` antes del
  `.add_local_dir` final.
- **`terraform/environments/production/variables.tf`** — 2 variables nuevas: `slack_default_model`
  (default `openai/gpt-5.5`) y `slack_classification_model` (default `claude-haiku-4-5`).
- **`terraform/environments/production/workers-slack.tf`** — `DEFAULT_MODEL` y
  `CLASSIFICATION_MODEL` del worker de Slack pasan a leer las variables en vez de strings
  hardcodeados.

### Lockfiles y misc

- `.gitignore`, `package-lock.json`, `terraform/environments/production/.terraform.lock.hcl` —
  diferencias menores generadas por el entorno local de desarrollo.

## Cómo extender

### Sumar algo al sandbox (paquetes, runtimes, CLIs)

Va a `primo_overlay.py`, **nunca a `base.py`**.

```python
# packages/modal-infra/src/images/primo_overlay.py

def apply_primo_overlay(image):
    return (
        image.apt_install("postgresql-client", "<nuevo-paquete>")
        .run_commands(
            # tu instalación nueva acá
        )
        .env({"PATH": "..."})
    )
```

**Consideraciones de cache**:

- `apply_primo_overlay` se aplica **antes** de `.add_local_dir(SANDBOX_RUNTIME_DIR)`. Eso es
  deliberado: las capas pesadas (descargas, compilación) tienen que estar antes de la copia del
  código runtime para no invalidarse cada vez que se edita el bridge.
- Si agregás algo que cambia frecuentemente al overlay, ponelo al **final** del overlay para no
  invalidar las capas anteriores.
- Para forzar rebuild de la imagen entera, bumpeá `CACHE_BUSTER` en `base.py` (lo hereda el overlay
  vía el grafo de operaciones). Si solo cambió el overlay, bumpeá `PRIMO_SANDBOX_VERSION` en
  `primo_overlay.py`.

### Parametrizar un valor que upstream tiene hardcodeado

Patrón estándar:

1. Agregar `variable "foo"` en `terraform/environments/production/variables.tf` con `default` igual
   al valor de upstream.
2. Cambiar el uso en el archivo de upstream para que lea `var.foo` en vez del literal.

Ejemplo real en `workers-slack.tf` con `slack_default_model`. Mantener el default igual a upstream
hace que el cambio sea trivial de re-aplicar después de un sync si upstream tocó la misma zona.

### Agregar un workflow propio

Workflow file nuevo en `.github/workflows/<nombre>.yml`. Nunca modificar `ci.yml`, `terraform.yml`,
ni `deploy-web.yml` salvo que sea estrictamente inevitable.

### Modificar código del control-plane / bots / web / etc.

Para cambios chicos de comportamiento (constantes, defaults), usar el patrón de variable de
Terraform descrito arriba.

Para cambios grandes (features propias, lógica de negocio), evaluar **antes de tocar**:

- ¿Se puede hacer en un archivo nuevo + un hook de una línea en el archivo upstream?
- ¿Se puede hacer vía configuración externa (env vars, secrets) sin tocar código?
- Si no hay otra: tocar el archivo upstream, pero mantener el diff **lo más chico posible** y bien
  comentado con `# primo: <razón>` para que sea identificable en futuros syncs.

## Sync con upstream

### Automático

El workflow `.github/workflows/sync-upstream.yml` corre **todos los días a las 09:00 UTC (06:00
ART)**:

1. Fetcha `upstream/main`.
2. Si no hay commits nuevos → no hace nada.
3. Crea `sync/upstream-YYYY-MM-DD` desde `main` y mergea upstream.
4. **Merge limpio** → abre un PR y lo encola con `gh pr merge --auto --merge`. Cuando CI pasa,
   GitHub mergea solo. Después los workflows de CI/Terraform en `main` deployan automáticamente.
5. **Hay conflicts** → commitea los markers, abre un PR **draft**, no activa auto-merge. Te toca
   resolver a mano (ver abajo).

Disparable manualmente desde Actions → "Sync with upstream" → Run workflow, o por CLI:

```bash
gh workflow run sync-upstream.yml --repo primo-devs/primo-bg-coding-agent
```

### Manual

Si necesitás sincronizar fuera de cron:

```bash
git checkout main
git pull origin main
git fetch upstream main
git checkout -b sync/upstream-$(date -u +%Y-%m-%d)
git merge upstream/main --no-edit
# resolver conflicts si los hay
git push -u origin HEAD
gh pr create --base main --title "chore: sync with upstream $(date -u +%Y-%m-%d)"
```

### Resolver conflicts comunes

Cuando el sync diario abre un PR draft con conflicts, las zonas probables son:

- **`packages/modal-infra/src/images/base.py`** — si upstream tocó la zona donde insertamos
  `apply_primo_overlay`. Restaurar el hook (import + wrap) y mantener los cambios de upstream
  alrededor.
- **`terraform/environments/production/workers-slack.tf`** — si upstream cambió cómo se pasan envs
  al worker. Restaurar el uso de `var.slack_default_model` / `var.slack_classification_model`.
- **`terraform/environments/production/variables.tf`** — si upstream agregó variables nuevas cerca
  de las nuestras. Suele ser un merge trivial de bloques contiguos.

Después de resolver:

```bash
git add <files>
git commit
git push
```

El PR pasa de draft a normal automáticamente cuando vos lo marcás "Ready for review" desde la UI, y
a partir de ahí CI corre y podés mergear.

## Prerequisitos del workflow de sync

Documentado acá para que no se pierda:

- **Branch protection** en `main` con los 13 checks de CI requeridos (no incluye Terraform porque
  tiene path filters).
- **Secret `SYNC_TOKEN`**: fine-grained PAT con `Contents: write` + `Pull requests: write` sobre
  este repo. Sin esto los PRs que abre el workflow no disparan CI y el auto-merge nunca completa.
  Expira → regenerar desde https://github.com/settings/personal-access-tokens y reemplazar el secret
  con `gh secret set SYNC_TOKEN`.
- **Auto-merge habilitado** a nivel repo (Settings → General → Pull Requests → Allow auto-merge).

## Checklist al traer un cambio propio

Antes de mergear un PR con cambios propios del fork:

- [ ] ¿El cambio está en un archivo nuevo en vez de modificar uno upstream?
- [ ] Si toca un archivo upstream, ¿es el diff mínimo posible (idealmente 1-3 líneas)?
- [ ] ¿Está actualizado el inventario de [Archivos 100% nuestros](#archivos-100-nuestros) o
      [Hooks mínimos](#hooks-mínimos-en-archivos-upstream) de este doc?
- [ ] ¿Hay defaults razonables que coincidan con upstream cuando aplique?
