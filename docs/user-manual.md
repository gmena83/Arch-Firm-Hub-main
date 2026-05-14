# KONTi Dashboard — User Manual

> **Bilingual:** every section is duplicated in English and Spanish. Skip to the language you prefer.
> Use the in-app **/help** page to read this manual offline.

---

# 🇺🇸 English

## 1. Sign in & roles

KONTi has six roles, each with a different surface:

| Role | What you see | Who has it |
|------|--------------|------------|
| `superadmin` | Everything + `/integrations` (API keys, audit log) | Carla (Month 2+) |
| `admin` | Everything except API key rotation | Jorge, senior PMs |
| `field_admin` | Master materials catalog + contractors + categories | Jorge (delegate) |
| `architect` | Design + project lifecycle, no audit | Michelle |
| `team` | Per-project work; no master catalog edits | All staff |
| `client` | Their own project(s), filtered | KONTi's clients |

Sign in at `https://app.konti.com` (or your Vercel URL during the trial). Token is stored in `localStorage` and refreshed automatically.

## 2. Daily flow — turning a lead into a project

1. **Lead arrives** — submitted via the public intake form at `/intake`.
2. **Triage** — admins see new leads at `/leads` ranked by KONTi's scoring (budget, terrain status, project type).
3. **Accept** — clicking "Accept" synthesizes a new project AND pre-loads the calculator with KONTi's canonical 107-row materials list. The project starts in the `discovery` phase.
4. **Configure** — open the project → click "Edit" on Project Setup → set the container count, square meters, risk classification (Paint by Numbers → Lost in the Fog).
5. **Advance phases** — each phase has a gate (signatures, payments, punchlist). The app blocks you if a gate isn't met.

## 3. Calculator (the meeting's #1 priority)

The calculator has four tabs:

1. **Estimate** — material list + container-count multiplier + line totals.
2. **Contractor** — auto-derived from receipt history, plus the manual **Labor rate $/hr** + **Margin %** override fields.
3. **Materials Library** — bulk-imports + the **Multi-item Receipt Scanner**.
4. **Variance** — Estimated vs Invoiced vs Actual, by category.

Key controls:

- **Container count** at top of Estimate — every material's quantity is `qtyPerContainer × this number`.
- **Risk classification** dropdown — multiplies the contingency reserve (1.05× → 1.20×).
- **Add Material** — picks from the 107-row master catalog.
- **Custom Line** — for change orders or off-list items; not affected by the container-count cascade.

## 4. Site visits

The **Site Visits** panel on a project's detail page is the team's on-site workpad:

1. Click **Start visit** → enter visitor + date + channel (on-site / remote).
2. Use the capture buttons:
   - **Photo** — opens camera (mobile) or file picker.
   - **Audio** — records in-browser; auto-transcribed via Whisper in ~30 seconds.
   - **Video** — file picker; saves to project Drive folder.
   - **Note** — inline text editor.
3. Each item has a **Client / Internal** toggle. Defaults:
   - Photos & videos → client-visible.
   - Audios & notes → internal-only (candid commentary).
4. The visit and its items show up in the project's Drive folder under `/site-visits/{date}-{visitor}/`.

## 5. Reports & PDFs

The **View Client Report** button on every project hero opens the formatted report. From there:

- **Preview** (eye icon) — inline PDF preview before sending.
- **Section visibility** (gear icon) — toggle which sections the client sees. Defaults to "everything visible"; toggle off the team-only sections.
- **Download PDF** — server-side render via PDF.co using your saved report template.
- **Theme** (sun/moon/square) — light, white, or dark background.

## 6. Photo upload flow

When uploading photos via the document modal:

1. Switch to **Site Photo(s)** mode.
2. Pick a **photo category** (Site conditions / Construction progress / Punchlist evidence / Final).
3. Toggle **Send to punchlist evidence** if the photo documents a punchlist item.
4. Toggle **Internal only** to hide from the client gallery.
5. Drop the photo or click to browse — multiple at once is fine.

A single photo per project can be **featured as cover** (star icon on hover) — that photo wins on the project card image AND the report's hero image.

## 7. Permits checklist

The `/permits` page hosts per-project checklists for the four Puerto Rico permits:

- **PCOC** — Permiso de Construcción
- **PUS** — Permiso de Uso
- **DEA** — Determinación de Ámbito
- **REA** — Recomendación de Endoso Ambiental

Each row has three booleans (Doc Filled Out / Sent / Received) and a comments field. The completion ratio (e.g. `7/16 received`) shows at the top of each checklist.

## 8. Contractor monitoring

On a project's detail page (team view), the **Contractor Monitoring** panel tracks per-contractor:

- Start date + initial finish date
- Approved delay days (auto-computed from Approved entries)
- New finish date (auto-computed)
- 5 sections: Notable Delays, Change Orders, Climate Conditions, Breach of Contract, Corrective Actions

Use this to track Soldadura Rizoma's weather delays separately from Henry Mercedes' material readiness issues.

## 9. Reporting feedback

During the trial we use a shared Excel template (see [Drive link]) with columns:

```
ID | Module | Severity | Description | Status | Reporter | Date | Notes
```

Status values: `Open`, `In Progress`, `Needs Decision`, `Closed`.

Add a row when you find an issue. Tatiana + Gonzalo will action open items during their working sessions. Don't track urgency in the description — use the Severity column.

## 10. What's coming in V2

These items were captured in the 2026-05-11 meeting but deferred to the V2 proposal:

- 🛸 Drone module for aerial site progress.
- 📐 Blueprint reader (OCR floor plans → material list).
- 📱 Native mobile app with offline-first capture.
- 💬 Real-time messaging by project with read receipts.
- 🎨 Branded PDFs with KONTi logo + colors before send.
- 👷 Subcontractor portal with login.
- 📧 Automated daily/weekly client email digests.
- 💵 Milestone billing via Stripe.
- ✍️ E-signature on change orders.
- 📅 Cross-project resource calendar.

---

# 🇪🇸 Español

## 1. Inicio de sesión y roles

KONTi tiene seis roles, cada uno con su propia vista:

| Rol | Qué ve | Quién lo tiene |
|-----|--------|----------------|
| `superadmin` | Todo + `/integrations` (llaves API, auditoría) | Carla (Mes 2+) |
| `admin` | Todo excepto rotación de llaves | Jorge, PMs senior |
| `field_admin` | Catálogo maestro de materiales + contratistas + categorías | Jorge (delegado) |
| `architect` | Diseño + ciclo de vida del proyecto, sin auditoría | Michelle |
| `team` | Trabajo por proyecto; sin edición de catálogo | Equipo |
| `client` | Sus propios proyectos, filtrados | Clientes KONTi |

Inicia sesión en `https://app.konti.com` (o tu URL Vercel durante la prueba). El token se guarda en `localStorage` y se renueva automático.

## 2. Flujo diario — del lead al proyecto

1. **Llega un lead** — vía el formulario público en `/intake`.
2. **Triaje** — admins ven nuevos leads en `/leads` ordenados por puntaje (presupuesto, terreno, tipo).
3. **Aceptar** — al hacer clic en "Aceptar" se sintetiza un proyecto nuevo Y se pre-carga la calculadora con los 107 materiales canónicos. Empieza en fase `discovery`.
4. **Configurar** — abrir proyecto → "Editar" en Configuración del Proyecto → fijar número de contenedores, metros cuadrados, clasificación de riesgo (Pintar por Números → Perdido en Niebla).
5. **Avanzar fases** — cada fase tiene una compuerta (firmas, pagos, punchlist). La app te bloquea si falta algo.

## 3. Calculadora (prioridad #1 de la reunión)

Cuatro pestañas:

1. **Estimado** — lista de materiales + multiplicador por contenedores + totales.
2. **Contratista** — derivado del historial de facturas, más los campos manuales **Tarifa $/hr** + **Margen %**.
3. **Biblioteca de Materiales** — importaciones masivas + el **Escáner de Recibos Multi-línea**.
4. **Varianza** — Estimado vs Facturado vs Real, por categoría.

Controles clave:

- **Número de contenedores** al inicio del Estimado — la cantidad de cada material es `cant.-por-contenedor × este número`.
- **Clasificación de riesgo** — multiplica la reserva de contingencia (1.05× → 1.20×).
- **Agregar Material** — del catálogo maestro de 107 filas.
- **Línea Personalizada** — para órdenes de cambio o ítems fuera de la lista; no se afecta por el multiplicador.

## 4. Visitas al sitio

El panel **Visitas al Sitio** en cada proyecto es el cuaderno de trabajo:

1. Clic en **Iniciar visita** → ingresa visitante + fecha + canal (en sitio / remoto).
2. Usa los botones de captura:
   - **Foto** — cámara (móvil) o selector de archivo.
   - **Audio** — graba en navegador; transcripción automática vía Whisper en ~30 segundos.
   - **Video** — selector de archivo; guarda en carpeta Drive del proyecto.
   - **Nota** — editor de texto en línea.
3. Cada ítem tiene un toggle **Cliente / Interno**. Predeterminados:
   - Fotos y videos → visible al cliente.
   - Audios y notas → solo interno (comentarios candidos).
4. La visita y sus ítems aparecen en la carpeta Drive del proyecto bajo `/site-visits/{fecha}-{visitante}/`.

## 5. Reportes y PDFs

El botón **Ver Reporte del Cliente** en cada cabecera de proyecto abre el reporte formateado. Desde ahí:

- **Vista previa** (ícono ojo) — PDF en línea antes de enviar.
- **Visibilidad de secciones** (ícono engranaje) — alterna qué secciones ve el cliente. Por defecto: todo visible; apaga las internas.
- **Descargar PDF** — render del servidor vía PDF.co usando tu plantilla guardada.
- **Tema** (sol/luna/cuadro) — claro, blanco, u oscuro.

## 6. Carga de fotos

Al subir fotos en el modal:

1. Cambia a modo **Foto(s) del Sitio**.
2. Elige **categoría de foto** (Condiciones / Progreso / Evidencia de punchlist / Final).
3. Marca **Enviar a evidencia del punchlist** si la foto documenta un ítem.
4. Marca **Solo interno** para ocultar de la galería del cliente.
5. Suelta la foto o navega — múltiples a la vez está bien.

Una foto por proyecto puede ser **destacada como portada** (estrella al pasar el cursor) — gana en la tarjeta del proyecto Y en la imagen principal del reporte.

## 7. Lista de permisos

La página `/permits` hospeda listas por proyecto para los cuatro permisos PR:

- **PCOC** — Permiso de Construcción
- **PUS** — Permiso de Uso
- **DEA** — Determinación de Ámbito
- **REA** — Recomendación de Endoso Ambiental

Cada fila tiene tres booleanos (Completado / Enviado / Recibido) y un campo de comentarios. La ratio (ej. `7/16 recibidos`) aparece arriba.

## 8. Monitoreo de contratistas

En el detalle del proyecto (vista equipo), el panel **Monitoreo del Contratista** rastrea por contratista:

- Fecha de inicio + fecha de finalización inicial
- Días de retraso aprobados (auto-calculado de entradas Aprobadas)
- Nueva fecha de finalización (auto-calculada)
- 5 secciones: Retrasos Notables, Órdenes de Cambio, Condiciones Climáticas, Incumplimiento, Acciones Correctivas

Usa esto para separar los retrasos por lluvia de Soldadura Rizoma de los problemas de material de Henry Mercedes.

## 9. Reportar feedback

Durante la prueba usamos una plantilla Excel compartida (ver [enlace Drive]) con columnas:

```
ID | Módulo | Severidad | Descripción | Estado | Reportado por | Fecha | Notas
```

Estados: `Abierto`, `En Progreso`, `Necesita Decisión`, `Cerrado`.

Agrega una fila cuando encuentres un problema. Tatiana + Gonzalo accionan los abiertos en sus sesiones. No pongas urgencia en la descripción — usa la columna Severidad.

## 10. Lo que viene en V2

Items capturados en la reunión del 2026-05-11 pero diferidos a la propuesta V2:

- 🛸 Módulo de drones para progreso aéreo del sitio.
- 📐 Lector de planos (OCR planos → lista de materiales).
- 📱 App móvil nativa con captura offline-first.
- 💬 Mensajería en tiempo real por proyecto con confirmación de lectura.
- 🎨 PDFs con logo + colores KONTi antes de enviar.
- 👷 Portal de subcontratistas con inicio de sesión.
- 📧 Resúmenes automáticos diarios/semanales por correo.
- 💵 Facturación por hitos vía Stripe.
- ✍️ Firma electrónica en órdenes de cambio.
- 📅 Calendario de recursos cross-project.

---

_Última actualización: 2026-05-13. Mantenida en `docs/user-manual.md` del repo._
