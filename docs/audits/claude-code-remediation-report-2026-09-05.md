# Trophē — Claude Code remediation and review handoff

**Fecha:** 2026-09-05
**Repositorio:** `zsoist/trophe`
**Worktree:** `/Users/daniel_serverm4/Documents/Codex/Trophe/worktrees/claude-followup-20260904`
**Rama:** `fix/claude-audit-p1-p2-20260904`
**Base revisada:** `8502814` (`fix(workout): reconcile live sessions and remediate independent review (#119)`)
**Estado de PR/merge/deploy:** se completa después del push; ver la sección de integración y el commit final del repositorio.

## Objetivo

Cerrar los P1/P2 de la revisión independiente de Workout sin ocultar resultados inciertos, sin convertir estimaciones anatómicas en hechos clínicos y sin introducir una escritura de base de datos de producción. La rama contiene las correcciones de recuperación, idempotencia, privacidad, accesibilidad, localización, documentación de seguridad y entrega del service worker, además del contrato de reconciliación owner-scoped para sesiones live.

Las capturas compartidas por el producto son inspiración visual, no evidencia anatómica ni una autorización para copiar activos de terceros. Cualquier nueva animación o imagen debe pasar revisión anatómica/coaching, tener fuente y licencia registradas, y describir de forma explícita cuándo se trata de una activación curada frente a una estimación de grupo.

## Cambios entregados

### Recuperación e idempotencia

- `components/workout/workout-persistence.ts` conserva el resultado detallado de RPC y clasifica fallos como `rejected`, `blocked` o `transient`. Los fallos de esquema/PostgREST/JWT/RLS que requieren reparación no liberan la clave idempotente; los rechazos definitivos sí liberan el sobre imposible; los resultados inciertos permanecen reintentables.
- `lib/workout/live-session.ts` y `components/workout/workspace/LiveWorkout.tsx` hacen que la cola pending sea explícita. Un set rechazado se marca como editable/no guardado y se elimina de la cola de reintento; no envenena el bloqueo de finalización de toda la sesión. Un resultado incierto o bloqueado conserva la barrera y ofrece retry.
- La finalización es idempotente y no publica dos estados de éxito. El diálogo de Finish refleja pending, recovery, rejected y error real; no permite editar el borrador mientras la operación está bloqueada.
- La carga de una sesión live ya no interpreta un token expirado como prueba de borrado. La ruta distingue `auth`, `forbidden`, `transport`, `legacy`, `missing`, terminal y activa.

### Reconciliación owner-scoped (P2-10)

La migración `drizzle/0084_owner_scoped_live_session_reconciliation.sql` añade `public.resolve_live_workout_session(uuid)`:

- `STABLE`, `SECURITY DEFINER`, `SET search_path = ''`.
- Exige `auth.uid()` y responde `42501` sin autenticación.
- Rechaza un id nulo con `22023`.
- No expone el propietario ni contenido libre a un usuario ajeno: devuelve `missing`, `forbidden`, `terminal`, `legacy`, `invalid` o `active`.
- Para `active` solo devuelve la versión y la estructura live mínima; para `terminal` devuelve fecha/duración.
- `EXECUTE` está revocado de `PUBLIC`, `anon` y `service_role`; solo se concede a `authenticated`.
- El cliente usa el RPC y solo cae al SELECT legacy cuando la función no existe en el entorno (`42883`/`PGRST202`), manteniendo la revalidación de auth.

La migración fue aplicada y verificada en Supabase local. No se escribió la base de producción. El operador debe aplicar en producción con la conexión directa/session pooler aprobada:

```bash
DIRECT_URL='postgresql://<operator-session-connection>' npm run db:migrate
```

Después debe verificarse que la función es `SECURITY DEFINER`, `STABLE`, ejecutable únicamente por `authenticated`, y que una llamada no autenticada termina con `42501`. No ejecutar esta migración contra producción desde una sesión de agente.

### Anatomía y claims de músculos

- `lib/workout/anatomy.ts`, `lib/workout/muscle-load.ts` y `components/workout/analytics/MuscleLoadChart.tsx` separan tipos curados de activaciones estimadas por grupo.
- Una activación de grupo no puede transportar un nombre de músculo específico ni el rol `primary`; la UI la muestra como `Group`/grupo y conserva la incertidumbre.
- `components/workout/workspace/PlanMuscleSummary.tsx` y sus tests verifican que no se presenta una región representativa como una afirmación anatómica precisa.
- Los datos de dolor/coaching no deben consumir una estimación de grupo como si fuera una evidencia clínica.

### Privacidad y borrado GDPR

- `lib/privacy/erasure.ts` pagina los ids de ejercicios creados por clientes y elimina identidad (`created_by`) antes de borrar el perfil, conservando filas de historial que aún son referenciadas.
- Antes de nullificar la autoría se limpian nombre e instrucciones de ejercicios de usuario. Esto reduce el riesgo de conservar PII escrita por el cliente en contenido de ejercicio.
- La política legal debe decidir si se requiere una anonimización de campos todavía más agresiva; esta rama no inventa una política de retención nueva.

### Accesibilidad, localización y navegación

- El Escape del diálogo de Finish no cierra el diálogo en el mismo commit en el que comienza el guardado; se mantiene captura/restauración de foco sin thrash.
- Undo limpia el anuncio de descanso para que repetir el set vuelva a anunciar `Rest started` correctamente.
- Se mantienen los cambios previos de focus ownership, transición de rutas, BotNav responsive y nombres ARIA localizados ES/EL.
- Los textos nuevos de reparación y bloqueos están en los ocho locales soportados.

### Seguridad, service worker y operabilidad

- `proxy.ts` es la única fuente documentada para el request gate de Next 16; la documentación ya no apunta a un `middleware.ts` raíz inexistente.
- CSP conserva `object-src`, `base-uri`, `frame-ancestors` y añade `form-action 'self'`; no se debe ampliar a orígenes cross-origin sin revisar auth/pagos.
- Se retiró el precache offline obsoleto. El worker construido es un artefacto de migración que purga caches antiguas y se auto-desregistra; Trophē no promete navegación offline.
- El canary permanece ejecutable, no dispara operaciones pagadas sin los flags de aprobación y no se ha ejecutado una operación de IA pagada.

## Archivos principales para revisar

- Persistencia/recovery: `components/workout/workout-persistence.ts`, `lib/workout/live-session.ts`, `components/workout/workspace/LiveWorkout.tsx`.
- Contrato DB: `drizzle/0084_owner_scoped_live_session_reconciliation.sql`, `drizzle/meta/_journal.json`.
- Anatomía: `lib/workout/anatomy.ts`, `lib/workout/muscle-load.ts`, `components/workout/analytics/MuscleLoadChart.tsx`, `components/workout/workspace/PlanMuscleSummary.tsx`.
- Privacidad: `lib/privacy/erasure.ts`.
- Entrega/seguridad: `next.config.ts`, `app/demo/page.tsx`, `components/shared/InstallCard.tsx`, `proxy.ts`, `DEPLOYMENT.md`, `SECURITY.md`, `ARCHITECTURE.md`, `CODEX.md`, `ROADMAP.md`.
- Regresión: `tests/workout/workout-persistence-reconcile.test.ts`, `tests/workout/live-session.test.ts`, `tests/components/live-workout-reconcile.test.tsx`, `tests/components/live-workout.test.tsx`, `tests/components/plan-muscle-summary.test.tsx`, `tests/db/live-session-reconciliation-contract.test.ts`, `tests/privacy/erasure-exercise-content.test.ts`, `tests/docs/`, `tests/ops/`.

## Verificación reproducible

Se ejecutó después de reconstruir dependencias con `npm ci --no-audit --no-fund` para eliminar una instalación local mezclada de `picomatch`, Playwright y `tslib`.

```bash
NODE_OPTIONS=--no-experimental-webstorage \
npm test -- --maxWorkers=1 --maxConcurrency=1 --testTimeout=30000 --reporter=dot
```

Resultado: **321 archivos pasaron, 1 omitido; 2.488 tests pasaron, 46 omitidos**.

```bash
NODE_OPTIONS=--no-experimental-webstorage npm run typecheck
NODE_OPTIONS=--no-experimental-webstorage npm run lint
npm run guard:theme
npm run assets:workout:check
git diff --check
npm run build
npm run perf:budget
```

Todos pasaron. El build Webpack de Next 16 generó **70/70 páginas estáticas** y reconoció `ƒ Proxy (Middleware)`. El chequeo de assets reportó **24 SVG nativos, masters 4K sin upscale, 273.970 bytes runtime y hashes deterministas**.

El foco de assets también pasó: 2 archivos y 68 tests.

### Presupuesto de rendimiento observado

Los presupuestos actuales pasan como caps de regresión, pero no representan todavía un objetivo premium de first-load para rutas autenticadas:

| Ruta | JS first-load observado |
|---|---:|
| `/` | 19,4 KiB (baseline 17,9; +8,5%) |
| `/login` | 272,7 KiB |
| `/dashboard` | 847,7 KiB |
| `/dashboard/workout` | 972,5 KiB |
| `/dashboard/workout/live` | 1.055,6 KiB |
| `/dashboard/workout/build` | 1.004,1 KiB |
| `/dashboard/workout/history` | 997,4 KiB |

La holgura de `/` es estrecha (+8,5% frente a la baseline). No declarar esto como “optimizado” hasta resolver el follow-up de splitting/lazy loading.

### E2E autenticado local

El intento de `npm run test:e2e:local-auth` no produjo un fallo de aserción de la aplicación. Tras reparar dependencias, Playwright quedó bloqueado por el `webServer` de Next local y terminó con:

```text
Error: Timed out waiting 120000ms from config.webServer
```

Los intentos de `next dev` (Turbopack y Webpack) quedaron compilando `/` indefinidamente en el host Node `v26.8.1`/Next actual. No se ejecutó E2E autenticado contra Supabase de producción. Repetir la matriz en CI/Node 20 o en un entorno local limpio; el último baseline conocido del handoff anterior fue 76/76 en Chromium desechable.

## Qué no se debe marcar como resuelto

1. **Performance P1:** las rutas autenticadas siguen alrededor de 848–1.056 KiB. Objetivo recomendado: <=300 KiB de JS inicial para una ruta de consumidor; requiere dividir diccionario por locale, aislar Framer Motion, lazy-load de analytics/atlas/form-check y revisar MediaPipe.
2. **RLS P2:** falta completar la matriz de políticas y planes para las tablas Workout restantes. En particular, revisar el alcance global de `workout_templates.shared` y el coste de autorización coach en `workout_sets`.
3. **Errores de ruta:** añadir boundaries `error.tsx` específicos para superficies de recovery de Workout.
4. **CSP reporting:** evaluar `report-to`/telemetría de violaciones sin relajar la política.
5. **Migración de producción:** `0084` necesita ejecución y verificación por un operador con acceso a la conexión de producción.
6. **E2E en este host:** está bloqueado por el runtime de desarrollo; no confundir el timeout del servidor con un producto verificado end-to-end.

## Roadmap premium de Workout (animación, imágenes y anatomía)

### P0 — contrato de evidencia

- Catálogo versionado por ejercicio: alias canónicos, patrón de movimiento, equipo, músculos primarios/secundarios/estabilizadores, fuente, revisor, fecha de revisión, licencia y confianza.
- Estados visibles y accesibles: `curated`, `group estimate` y `unavailable`. Nunca convertir `unknown` en una precisión falsa.
- Copy seguro: “suele enfatizar”, “asiste” y “estabiliza”; no usar promesas de prevención/rehabilitación sin evidencia clínica.
- Matriz de QA que conecte ejercicio, media, anatomía, localización, instrucciones y regresiones.

### P1 — imágenes y animaciones de calidad premium

- Priorizar los 50–100 ejercicios más usados con masters revisados antes de ampliar el long tail.
- Para cada movimiento: frame inicial, loop corto, frame final y fallback estático derivados del mismo master; cámara, crop, luz y proporciones consistentes.
- Capas informativas separadas: setup, trayectoria, respiración/bracing, rango de movimiento, errores comunes, regresiones/progresiones y contraindicaciones generales no clínicas.
- Animar la carga por fase (excéntrica, transición, concéntrica), no con un pulso ornamental global.
- Codificar primary/secondary/stabilizer con forma, etiqueta y texto accesible; el color nunca es la única señal.
- Front/back persistente, leyenda estable, explicación breve de “por qué este músculo” y anuncio AT solo cuando cambia información significativa.
- `prefers-reduced-motion`, ahorro de datos y fallback poster sin perder instrucciones.
- Toda imagen generada o adquirida requiere revisión humana de anatomía/coaching antes de marcarse como verificada.

### P1 — experiencia y rendimiento

- Precargar solo el primer frame visible; cargar loops y atlas detallado bajo demanda.
- Dividir diccionarios por locale activo y aislar analytics/form-check de la ruta inicial.
- Instrumentar Core Web Vitals por ruta, dispositivo y calidad de conexión.
- Registrar latencia de carga de media, tasa de fallback y comprensión de cues; no medir éxito solo por bytes.

### P2 — plataforma

- Boundaries de error por ruta, retry seguro y recuperación de cola sin perder el set en edición.
- Completar RLS/EXPLAIN de Workout y pruebas multirol.
- Añadir revisión periódica de contenido y un changelog de anatomía para que cada claim sea auditable.

## Solicitud para Claude Code

Revisar el árbol actual y devolver findings primero, ordenados por severidad, con citas `file:line`. Separar hechos verificados, inferencias y recomendaciones. Reejecutar los gates en Node 20/CI, revisar el contrato RPC y sus grants, simular expiración de auth y dos pestañas/reconnect, comprobar que los rejects son editables pero los resultados inciertos conservan idempotencia, y auditar que ningún grupo estimado entre en claims de músculo específico o pain-avoidance.

La recomendación esperada para esta ola es **approve with follow-up** si los gates remotos están verdes: las correcciones críticas están cubiertas, pero performance autenticada, RLS residual, boundaries, CSP reporting y migración de producción siguen siendo trabajo explícito.

## Integración autorizada

- PR: pendiente de creación al momento de escribir este documento.
- Merge: pendiente de checks remotos.
- Deploy: pendiente de la plataforma; verificar con probes anónimos (`/` debe responder 200 y `/dashboard/workout` debe redirigir a login) y sin ejecutar canary pagado.
- No hubo escrituras en la base de producción ni consumo de operaciones de IA pagadas.
