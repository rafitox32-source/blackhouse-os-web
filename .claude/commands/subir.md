---
description: Commit + push + verificar el deploy de Vercel de blackhouse-os-web
argument-hint: [mensaje de commit en una línea]
---

Publicá los cambios de este repo (`rafitox32-source/blackhouse-os-web`, Vercel auto-despliega
`main`). Mensaje sugerido: `$ARGUMENTS` (si viene vacío, redactalo vos en una línea).

Repo local: `C:/Users/BLACK HOUSE/Desktop/web-limpia`
URL de producción: `https://blackhouse-os-web.vercel.app`

## 1. Chequeo previo

- `git -C "C:/Users/BLACK HOUSE/Desktop/web-limpia" status --short`
- `node --check` en cada `.js` modificado (sobre todo `api/db.js`, `api/login.js`). Si falla,
  pará acá.
- **Ojo con `api/db.js`**: toca el aislamiento de datos por usuario/empresa. Si el cambio
  quita o relaja un filtro, mostrámelo y esperá confirmación — ya fue bloqueado 3 veces por
  debilitar seguridad, y con razón.

## 2. Commit y push

- `git -C "<repo>" fetch origin main && git -C "<repo>" rebase origin/main`
- `git -C "<repo>" add -A`
- `git -C "<repo>" commit -m "<una línea>"` — nunca heredoc (rompe en PowerShell).
- `git -C "<repo>" push origin main`

## 3. Verificar el deploy de verdad

Vercel tarda. **No uses `sleep`** (está bloqueado). Poleá el sitio hasta que sirva el cambio:

```bash
until curl -s "https://blackhouse-os-web.vercel.app/<pagina-tocada>" | grep -q '<algo nuevo del cambio>'; do :; done
```

Si el cambio no es visible en el HTML (p.ej. está en `api/`), verificá el endpoint con `curl`
y un caso real — **sin imprimir claves ni tokens** en la salida.

## 4. Reportar

Dos líneas: qué se desplegó y qué tengo que probar yo (sobre todo tracking, tienda del
cliente y `camara-celular.html`, que dependen de datos reales o de hardware).
