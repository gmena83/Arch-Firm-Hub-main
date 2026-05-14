# Feedback vs Changelog — KONTi Dashboard
# Reporte de Feedback vs. Cambios — Dashboard KONTi

_Prepared (Preparado): 2026-04-24_

This report consolidates every piece of feedback collected through the KONTi Dashboard in-app feedback inbox and pairs it with the project tasks (or commits) that addressed it. Quoted feedback is preserved verbatim — Spanish stays Spanish, English stays English.

Este reporte consolida cada pieza de feedback recibida a través del buzón en la app del Dashboard KONTi y la empareja con la tarea de proyecto (o commit) que la atendió. Las citas se conservan textuales — el español queda en español y el inglés en inglés.

> **How to read the references (Cómo leer las referencias):** Each item cites a `Task #N` (project-board reference inside the Replit workspace) and / or a 7-character commit hash. These are shown as plain text rather than hyperlinks because the project task panel and the git repository are both internal to the workspace and have no public URLs. The team can open each `Task #N` in the workspace task panel and look up each commit hash with `git show <hash>`.

---

## Executive Summary (Resumen Ejecutivo)

**Total feedback items (Total de ítems):** 98

### By status (Por estado)

| Status (Estado) | Count (Cantidad) | % |
|---|---:|---:|
| ✅ Completed (Completado) | 19 | 19% |
| 🟡 In progress / scheduled (En progreso / programado) | 6 | 6% |
| ⏳ Pending (Pendiente) | 45 | 46% |
| 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación) | 28 | 29% |
| **Total** | **98** | **100%** |

### By topic (Por tema)

| Topic (Tema) | Count (Cantidad) |
|---|---:|
| Contenido / Copy (Content) | 47 |
| Other (Otro) | 21 |
| Feature request (Solicitud de funcionalidad) | 15 |
| Design (Diseño) | 13 |
| Bug report (Reporte de bug) | 2 |

### By page (Por página)

| Page (Página) | Total | ✅ Completed | 🟡 In progress | ⏳ Pending | 💬 Out of scope |
|---|---:|---:|---:|---:|---:|
| https://konti-demo.replit.app/projects/proj-1/report | 15 | 0 | 0 | 10 | 5 |
| https://konti-demo.replit.app/projects/proj-1 | 22 | 1 | 1 | 14 | 6 |
| https://konti-demo.replit.app/projects/proj-2 | 3 | 3 | 0 | 0 | 0 |
| https://konti-demo.replit.app/projects/proj-2/report | 1 | 0 | 1 | 0 | 0 |
| https://konti-demo.replit.app/projects/proj-3 | 1 | 1 | 0 | 0 | 0 |
| https://konti-demo.replit.app/projects/proj-1776983841174 | 7 | 0 | 0 | 4 | 3 |
| https://konti-demo.replit.app/dashboard | 4 | 1 | 1 | 1 | 1 |
| https://konti-demo.replit.app/calculator | 14 | 5 | 1 | 6 | 2 |
| https://konti-demo.replit.app/calculator?projectId=proj-1&tab=variance | 4 | 0 | 0 | 2 | 2 |
| https://konti-demo.replit.app/calculator?projectId=proj-1776983841174&tab=variance | 1 | 0 | 0 | 0 | 1 |
| https://konti-demo.replit.app/materials | 3 | 0 | 0 | 3 | 0 |
| https://konti-demo.replit.app/permits | 7 | 1 | 0 | 3 | 3 |
| https://konti-demo.replit.app/team | 3 | 2 | 0 | 1 | 0 |
| https://konti-demo.replit.app/ai | 10 | 5 | 2 | 0 | 3 |
| https://konti-demo.replit.app/leads | 3 | 0 | 0 | 1 | 2 |

---

## Table of Contents (Tabla de Contenidos)

- [**https://konti-demo.replit.app/projects/proj-1/report** (15)](#page-projects-proj-1-report)
  - [Contenido / Copy (Content) (11)](#page-projects-proj-1-report-content)
  - [Design (Diseño) (3)](#page-projects-proj-1-report-design)
  - [Other (Otro) (1)](#page-projects-proj-1-report-other)
- [**https://konti-demo.replit.app/projects/proj-1** (22)](#page-projects-proj-1)
  - [Feature request (Solicitud de funcionalidad) (8)](#page-projects-proj-1-feature-request)
  - [Contenido / Copy (Content) (6)](#page-projects-proj-1-content)
  - [Other (Otro) (6)](#page-projects-proj-1-other)
  - [Design (Diseño) (2)](#page-projects-proj-1-design)
- [**https://konti-demo.replit.app/projects/proj-2** (3)](#page-projects-proj-2)
  - [Feature request (Solicitud de funcionalidad) (2)](#page-projects-proj-2-feature-request)
  - [Bug report (Reporte de bug) (1)](#page-projects-proj-2-bug-report)
- [**https://konti-demo.replit.app/projects/proj-2/report** (1)](#page-projects-proj-2-report)
  - [Design (Diseño) (1)](#page-projects-proj-2-report-design)
- [**https://konti-demo.replit.app/projects/proj-3** (1)](#page-projects-proj-3)
  - [Design (Diseño) (1)](#page-projects-proj-3-design)
- [**https://konti-demo.replit.app/projects/proj-1776983841174** (7)](#page-projects-proj-1776983841174)
  - [Contenido / Copy (Content) (5)](#page-projects-proj-1776983841174-content)
  - [Other (Otro) (1)](#page-projects-proj-1776983841174-other)
  - [Bug report (Reporte de bug) (1)](#page-projects-proj-1776983841174-bug-report)
- [**https://konti-demo.replit.app/dashboard** (4)](#page-dashboard)
  - [Design (Diseño) (1)](#page-dashboard-design)
  - [Feature request (Solicitud de funcionalidad) (1)](#page-dashboard-feature-request)
  - [Other (Otro) (1)](#page-dashboard-other)
  - [Contenido / Copy (Content) (1)](#page-dashboard-content)
- [**https://konti-demo.replit.app/calculator** (14)](#page-calculator)
  - [Contenido / Copy (Content) (7)](#page-calculator-content)
  - [Other (Otro) (3)](#page-calculator-other)
  - [Design (Diseño) (2)](#page-calculator-design)
  - [Feature request (Solicitud de funcionalidad) (2)](#page-calculator-feature-request)
- [**https://konti-demo.replit.app/calculator?projectId=proj-1&tab=variance** (4)](#page-calculator-projectid-proj-1-tab-variance)
  - [Contenido / Copy (Content) (4)](#page-calculator-projectid-proj-1-tab-variance-content)
- [**https://konti-demo.replit.app/calculator?projectId=proj-1776983841174&tab=variance** (1)](#page-calculator-projectid-proj-1776983841174-tab-variance)
  - [Contenido / Copy (Content) (1)](#page-calculator-projectid-proj-1776983841174-tab-variance-content)
- [**https://konti-demo.replit.app/materials** (3)](#page-materials)
  - [Contenido / Copy (Content) (2)](#page-materials-content)
  - [Other (Otro) (1)](#page-materials-other)
- [**https://konti-demo.replit.app/permits** (7)](#page-permits)
  - [Contenido / Copy (Content) (5)](#page-permits-content)
  - [Feature request (Solicitud de funcionalidad) (1)](#page-permits-feature-request)
  - [Other (Otro) (1)](#page-permits-other)
- [**https://konti-demo.replit.app/team** (3)](#page-team)
  - [Design (Diseño) (2)](#page-team-design)
  - [Contenido / Copy (Content) (1)](#page-team-content)
- [**https://konti-demo.replit.app/ai** (10)](#page-ai)
  - [Other (Otro) (7)](#page-ai-other)
  - [Design (Diseño) (1)](#page-ai-design)
  - [Feature request (Solicitud de funcionalidad) (1)](#page-ai-feature-request)
  - [Contenido / Copy (Content) (1)](#page-ai-content)
- [**https://konti-demo.replit.app/leads** (3)](#page-leads)
  - [Contenido / Copy (Content) (3)](#page-leads-content)
- [Pending — Not Yet Planned (Pendientes — Aún sin planificar)](#pending-appendix)
- [In Progress / Scheduled (En progreso / programado)](#inprogress-appendix)
- [Out of scope / needs discussion (Fuera de alcance / requiere conversación)](#oos-appendix)
- [Completed (Completado)](#completed-appendix)
- [Evidence Index (Índice de evidencia)](#evidence-index)
- [Methodology Note (Nota de metodología)](#methodology-note)

---

## Feedback by Page (Feedback por Página)

<a id="page-projects-proj-1-report"></a>

### https://konti-demo.replit.app/projects/proj-1/report

<a id="page-projects-proj-1-report-content"></a>

#### Contenido / Copy (Content) — 11 items

##### Item 95 · 2026-04-23 · ⏳ Pending (Pendiente)

> "weather status"

**Refs:** —

**Why (Por qué):** Copy change ('weather status') has not been applied.

**Por qué (Why):** No se aplicó el cambio de copia ('weather status').

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-cd950995-f7cd-4e7b-bb6f-11e5ba070e6a-img-0) (asset: `1776986465120_5271f36e58f2d13d6f7ec61927b74a3b.png`)_

---

##### Item 94 · 2026-04-23 · ⏳ Pending (Pendiente)

> estas fases no deberian tener numeros, esto ya que en el punchlist que vamos a incluir abajo salen las fases de construccion que si tienen numeros y se correlacionan a traves de todos los docuementos enviados. Por ende, estas fases que son las macro se pueden quedar con su nombre...

**Refs:** —

**Why (Por qué):** Removing numbers from the macro phases on the report (so they don't conflict with construction-phase numbering) is not yet planned.

**Por qué (Why):** Aún no se planifica quitar números a las fases macro del reporte (para no chocar con la numeración de construcción).

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-f9d632f0-66af-47b7-9c6e-13cc4735a326-img-0) (asset: `1776986372789_16c89f35d212f994acf134a1d286ee73.png`)_

---

##### Item 93 · 2026-04-23 · ⏳ Pending (Pendiente)

> este entonces trataria de que fuera como el phase pie chart que tenemos en el punchlist vs otra vez budget

**Refs:** —

**Why (Por qué):** A 'phase pie chart vs. budget' visualization on the report is not yet planned.

**Por qué (Why):** Aún no se planifica una visualización 'pie de fases vs. budget' en el reporte.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-06d9e685-feb0-4904-8b40-bcd40b21e878-img-0) (asset: `1776986303178_83e98e178edab0086da988d0ea9a2f8d.png`)_

---

##### Item 92 · 2026-04-23 · ⏳ Pending (Pendiente)

> si este es el client report, la data debe match el reporte que les enviamos con sus categorias correspondientes y toda la info que sale en el...

**Refs:** —

**Why (Por qué):** Aligning the client report categories one-to-one with the team's spreadsheet is not yet planned — overlaps with #66.

**Por qué (Why):** Aún no se planifica alinear las categorías del reporte cliente uno a uno con la hoja del equipo — se solapa con #66.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-eb8ab45c-ed16-4315-b6fe-51b0968eb416-img-0) (asset: `1776986254047_42e458cc3e061dac73af6c7a7379c07e.png`)_

---

##### Item 91 · 2026-04-23 · ⏳ Pending (Pendiente)

> si acaso aqui es que debe estar el punchlist con los links a fotos como esta en el excell llamado "Client Punch list" Ahi tambien vive el "Contractor Monitoring" que da la data de si el contratista se atraso y porque.. a veces es justificado otras no y qjuiero que el cliente pueda ver eso para que entienda

**Refs:** —

**Why (Por qué):** Embedding the punchlist with photo links and the contractor-monitoring narrative on the report is not yet planned — overlaps with #14, #78.

**Por qué (Why):** Aún no se planifica embeber en el reporte el punchlist con links a fotos y el monitoreo del contratista — se solapa con #14, #78.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-c8f74ced-cc6f-41ea-8507-0abba8942176-img-0) (asset: `1776986094829_12cdd2b0f740c48d99315acd3084d105.png`)_

---

##### Item 90 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> no entiendo esta parte.. es como las instrucciones par el cliente que sepa lo que le toca?

**Refs:** —

**Why (Por qué):** Clarification on whether this section is client instructions — needs a walkthrough.

**Por qué (Why):** Aclaración sobre si esta sección son instrucciones para el cliente — requiere recorrido.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-3f982cc5-6276-42a9-92af-0a4f85432045-img-0) (asset: `1776986025143_27da31aa3297a615306404b062e5e002.png`)_

---

##### Item 68 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> sera que esta pagina es el "punchlist"?

**Refs:** —

**Why (Por qué):** Clarification: is this page the punchlist? — needs a walkthrough.

**Por qué (Why):** Aclaración: ¿esta página es el punchlist? — requiere recorrido.


---

##### Item 67 · 2026-04-23 · ⏳ Pending (Pendiente)

> si esta pagina es para el cliente.. ellos deben ver las categorias no el BOM.

**Refs:** —

**Why (Por qué):** Restructuring the client report to show categories instead of the BOM is not yet planned — overlaps with #91.

**Por qué (Why):** Aún no se planifica reestructurar el reporte cliente para mostrar categorías en vez del BOM — se solapa con #91.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-3fbefe94-7381-4d13-9014-065ec7b2d769-img-0) (asset: `1776982290953_12cdd2b0f740c48d99315acd3084d105.png`)_

---

##### Item 66 · 2026-04-23 · ⏳ Pending (Pendiente)

> este management fee de donde sale? lo podemos editar en el calculator?

**Refs:** —

**Why (Por qué):** An editable management-fee field in the calculator is not yet built.

**Por qué (Why):** Aún no existe un campo editable de management fee en la calculadora.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-6c0741e1-c9e9-4c26-9131-c07f57df5705-img-0) (asset: `1776982216308_06151dd6c3de8bb8d0acb47042f32fb7.png`)_

---

##### Item 65 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> de donde se estan alimentando estas catergorias?

**Refs:** —

**Why (Por qué):** Clarification about category sources — needs a walkthrough.

**Por qué (Why):** Aclaración sobre origen de categorías — requiere recorrido.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-7db9db9c-b4cd-4d7e-8901-bbfa7a84e496-img-0) (asset: `1776982108156_83e98e178edab0086da988d0ea9a2f8d.png`)_

---

##### Item 64 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> esto es client view o konti view?

**Refs:** —

**Why (Por qué):** Clarification: client view vs. KONTi view — needs a walkthrough; report has both modes today.

**Por qué (Why):** Aclaración: vista cliente vs. vista KONTi — requiere recorrido; el reporte tiene ambos modos hoy.


---

<a id="page-projects-proj-1-report-design"></a>

#### Design (Diseño) — 3 items

##### Item 98 · 2026-04-23 · ⏳ Pending (Pendiente)

> no me encanta el negro..esta muy agresivo.. creo que debemos usar la paleta de colores que tenemos en los excell

**Refs:** —

**Why (Por qué):** Switching the report from black to the KONTi palette is not yet planned — see also #2, #17.

**Por qué (Why):** Aún no se planifica cambiar el reporte del negro a la paleta KONTi — ver #2, #17.


---

##### Item 97 · 2026-04-23 · ⏳ Pending (Pendiente)

> este logo esta muy pequeño.

**Refs:** —

**Why (Por qué):** Logo size on the report has not been increased yet.

**Por qué (Why):** Aún no se aumentó el tamaño del logo en el reporte.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-a2ee76aa-bfea-4383-b35a-775d26c1b6d5-img-0) (asset: `1776986650845_17c409711e2f30831694a504d85e1939.png`)_

---

##### Item 3 · 2026-04-15 · ⏳ Pending (Pendiente)

> Lo dejaria en fondo blanco para una mejor visual o con la posibilidad de light

**Refs:** —

**Why (Por qué):** Light mode for the report page is not on the roadmap yet — see also items #17 and #97.

**Por qué (Why):** El modo claro del reporte aún no está en la hoja de ruta — relacionado con los ítems #17 y #97.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-e0c9883c-a960-40b0-a0cd-c7e3fad1d60c-img-0) (asset: `1776266110431_8e8260357039ca18b7bdda64cd20c7c0.png`)_

---

<a id="page-projects-proj-1-report-other"></a>

#### Other (Otro) — 1 item

##### Item 96 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> esto simplemente esta leyendo asana ??

**Refs:** —

**Why (Por qué):** Asana sync question for the report — same theme as #23, #61, #74.

**Por qué (Why):** Pregunta de sync con Asana para el reporte — mismo tema que #23, #61, #74.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-6ffe9703-44f6-4ce4-a41a-5f26594861a3-img-0) (asset: `1776986582165_3546ca4bde9414762485b4a5e7bfe84d.png`)_

---

<a id="page-projects-proj-1"></a>

### https://konti-demo.replit.app/projects/proj-1

<a id="page-projects-proj-1-feature-request"></a>

#### Feature request (Solicitud de funcionalidad) — 8 items

##### Item 25 · 2026-04-15 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> El respositorio de los datos tiene que estar en el Drive. Puede haber un tilde de subir al Drive o a una base de dato

**Refs:** —

**Why (Por qué):** Google Drive as the canonical store is a third-party integration; needs scoping.

**Por qué (Why):** Google Drive como repositorio canónico es una integración de terceros; requiere alcance.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-1c130276-42cd-454e-b840-387fccf915a2-img-0) (asset: `1776277223338_fc3f6624a6356c4a07c8ad6d84ff2679.png`)_

---

##### Item 21 · 2026-04-15 · 🟡 In progress / scheduled (En progreso / programado)

> Agregar Recibos de compras – solo del lado de KONTi  y que puede el sistema cotejarlos con el informe

**Refs:** Task #22, Task #27

**Why (Por qué):** KONTi-side receipt entry shipped (#22); persistence across server restarts is scheduled (#27).

**Por qué (Why):** Entrada de recibos del lado KONTi entregada (#22); la persistencia entre reinicios está programada (#27).

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-e86eb69f-90da-4690-8af6-49742b18b628-img-0) (asset: `1776268252864_ae5d234a133728a593db748145e1cf14.png`)_

---

##### Item 19 · 2026-04-15 · ⏳ Pending (Pendiente)

> Agregar columnas de parte del cliente de monto total, pagado, saldo pendiente y estado por factura

**Refs:** —

**Why (Por qué):** Per-invoice columns (total, paid, balance, status) are not yet on the client view.

**Por qué (Why):** Aún no hay columnas por factura (total, pagado, saldo, estado) en la vista del cliente.


---

##### Item 17 · 2026-04-15 · ⏳ Pending (Pendiente)

> Agregar pestaña de “Gastos no facturables”

**Refs:** —

**Why (Por qué):** A 'Gastos no facturables' tab is not yet built.

**Por qué (Why):** Aún no se construyó la pestaña de 'Gastos no facturables'.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-fc5470d9-b5fe-4645-bbf8-2b20417f06a2-img-0) (asset: `1776267828826_157dc5c930aa5c8fb56a5a50334979a6.png`)_

---

##### Item 16 · 2026-04-15 · ⏳ Pending (Pendiente)

> Agregar carga de archivos por parte del cliente o definir claramente si puede subir documentos y en qué sección

**Refs:** —

**Why (Por qué):** Client-side document upload is not yet built; today only the team uploads.

**Por qué (Why):** Aún no se construyó la carga de documentos del lado del cliente; hoy sólo sube el equipo.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-f63edb55-464c-4e8c-a529-b3162b376513-img-0) (asset: `1776267732676_502425b35fad347d59dbd14ba6934d38.png`)_

---

##### Item 11 · 2026-04-15 · ⏳ Pending (Pendiente)

> No veo la sección de Organizar la categoría “Acuerdos” por “Contratos y Acuerdos de compra”

**Refs:** —

**Why (Por qué):** A separate 'Contratos y Acuerdos de compra' grouping is not yet built; documents are flat today.

**Por qué (Why):** Aún no existe la categoría 'Contratos y Acuerdos de compra'; los documentos están planos hoy.


---

##### Item 7 · 2026-04-15 · ⏳ Pending (Pendiente)

> Quedaria pendiente una sección de  logs de acciones del cliente en la plataforma

**Refs:** —

**Why (Por qué):** A client action log (audit trail) is not yet planned.

**Por qué (Why):** Aún no está planificado un log de acciones del cliente.


---

##### Item 4 · 2026-04-15 · ⏳ Pending (Pendiente)

> No encuentro la sección de fotos y notas de fotos o videos

**Refs:** —

**Why (Por qué):** A photos/videos & comments section inside the project is not yet built — see also items #13, #22, #68.

**Por qué (Why):** Aún no se construyó una sección de fotos/videos y comentarios dentro del proyecto — relacionado con #13, #22, #68.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-aaee0b59-4b3a-4ece-aeca-9b944d036a74-img-0) (asset: `1776266157265_fad19e8ecbb414d79ede9d16553128d9.png`)_

---

<a id="page-projects-proj-1-content"></a>

#### Contenido / Copy (Content) — 6 items

##### Item 22 · 2026-04-15 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> Quieren actualizarlo 1 vez a la semana

**Refs:** —

**Why (Por qué):** Workflow expectation ('update once a week') — process note, not a product change.

**Por qué (Why):** Expectativa de flujo ('actualizar una vez por semana') — nota de proceso, no un cambio de producto.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-f8acf1ec-ede7-4219-934f-7d1a0b9e4cf2-img-0) (asset: `1776277055492_ad9214209634a98f1754d363b91f35f6.png`)_

---

##### Item 20 · 2026-04-15 · ⏳ Pending (Pendiente)

> En configuración del cliente agregar teléfono, dirección postal y dirección física

**Refs:** —

**Why (Por qué):** Client profile fields (phone, postal/physical addresses) are not yet editable in settings.

**Por qué (Why):** Aún no son editables en configuración los datos del cliente (teléfono, dirección postal/física).


---

##### Item 15 · 2026-04-15 · ⏳ Pending (Pendiente)

> El informe de seguimiento del contratista debería mostrar retrasos, clima, problemas, cambios, incumplimientos y retrabajos. Lo ampliaria un poco más con la info.

**Refs:** Task #7, Task #11, Task #25

**Why (Por qué):** Weather (#7), change orders (#11) and punchlist (#25) shipped, but a single consolidated 'contractor monitoring' report is not yet planned — surfacing for triage.

**Por qué (Why):** Clima (#7), órdenes de cambio (#11) y punchlist (#25) entregados, pero un único reporte consolidado de 'contractor monitoring' aún no está planificado — se levanta para triage.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-9c0297f1-fe4e-476b-a859-6e67af45150f-img-0) (asset: `1776267254084_aed091d2ab68f1cbeb928b5443e63335.png`)_

---

##### Item 14 · 2026-04-15 · ⏳ Pending (Pendiente)

> Sumaria la parte de fotos y comentarios

**Refs:** —

**Why (Por qué):** Photos & comments section is not yet built — see #3, #22, #68.

**Por qué (Why):** Aún no se construyó la sección de fotos y comentarios — ver #3, #22, #68.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-c1138fea-01d5-409d-b4f3-c72c04db59b0-img-0) (asset: `1776267185335_77a6c104c09b95d8be48f5bb55f3f8de.png`)_

---

##### Item 13 · 2026-04-15 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> A veces las fases van en paralelo. ¿Qué pasa entonces? Podemos armar otra visual o se puede hacer en paralelo?

**Refs:** —

**Why (Por qué):** Parallel phases would change the validator-driven 9-phase model from #11; needs a product call before building.

**Por qué (Why):** Las fases en paralelo cambiarían el modelo de 9 fases del #11; requiere decisión de producto antes de construir.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-f5a2ec22-4eb0-435b-ac61-bab427f43b64-img-0) (asset: `1776267155443_e1e99106fd00002dd086d645c2bf8aa4.png`)_

---

##### Item 12 · 2026-04-15 · ⏳ Pending (Pendiente)

> Cambiar texto a Cronograma del proyecto

**Refs:** —

**Why (Por qué):** Copy change ('Cronograma del proyecto') has not been applied yet.

**Por qué (Why):** Aún no se aplicó el cambio de texto a 'Cronograma del proyecto'.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-966e1f6f-8045-4c89-8f2b-c0cfd7cec340-img-0) (asset: `1776267129739_bce3e0a9326a7dfcbb74c8b538611d7a.png`)_

---

<a id="page-projects-proj-1-other"></a>

#### Other (Otro) — 6 items

##### Item 63 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> que significa esto?

**Refs:** —

**Why (Por qué):** Clarification request — needs a walkthrough.

**Por qué (Why):** Pregunta de aclaración — requiere recorrido.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-94e2e46b-cd80-4144-839a-df1b870712df-img-0) (asset: `1776981976493_fd8cfb713b9dc22f06099c6eade7a673.png`)_

---

##### Item 62 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> esto esta conectado a asana?

**Refs:** —

**Why (Por qué):** Asana connection question — see #23, #74, #95.

**Por qué (Why):** Pregunta sobre conexión a Asana — ver #23, #74, #95.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-8904ad49-3eb0-4af7-a85b-a08f5cc01e1b-img-0) (asset: `1776981948293_a84f7a152e0103d7c9f95e1ed893aef3.png`)_

---

##### Item 27 · 2026-04-15 · ⏳ Pending (Pendiente)

> Ellos van a marcar que quieren que el cliente vea y que no

**Refs:** —

**Why (Por qué):** Per-document client-visibility flag is not yet built.

**Por qué (Why):** Aún no existe la marca de visibilidad de cada documento al cliente.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-11a8d4e6-e291-4872-a946-d3e0b3411fbf-img-0) (asset: `1776277613370_1a35726c4ec396daffb0f4ef1b823e61.png`)_

---

##### Item 26 · 2026-04-15 · ⏳ Pending (Pendiente)

> Que quede la ultima versión aquí, pero tengamos historial de los documentos. Pero solo se puede descargar la ultima versión

**Refs:** —

**Why (Por qué):** Document version history (with download of latest) is not yet built.

**Por qué (Why):** Aún no existe el historial de versiones de documentos (con descarga de la última).

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-cf6b1a0e-4ee5-411d-b4a8-bfd7a883b82a-img-0) (asset: `1776277401454_85029a75bd7642753fac47d347a6f160.png`)_

---

##### Item 24 · 2026-04-15 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> Conectado a ASana. Si se marca lista en asana o aquí se traslada

**Refs:** —

**Why (Por qué):** Bidirectional Asana sync is a third-party integration; needs scoping before building.

**Por qué (Why):** La sincronización bidireccional con Asana es una integración de terceros; requiere alcance antes de construir.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-096ee087-4432-4626-ab6c-73b79ae499b7-img-0) (asset: `1776277183405_cf4037afdd20b68a84f92875dcb39525.png`)_

---

##### Item 23 · 2026-04-15 · ⏳ Pending (Pendiente)

> Quiere que sea automadministrable y que puedan subir las imagenes

**Refs:** —

**Why (Por qué):** Self-administration and image upload by client are not yet built — overlaps with #3, #13, #15, #68.

**Por qué (Why):** Aún no se construyó la auto-administración ni la carga de imágenes por el cliente — se solapa con #3, #13, #15, #68.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-6d2b90cd-6d7c-47cf-93c9-5687127637bf-img-0) (asset: `1776277074527_d24f0d0fb57e52450e243402d9cd3255.png`)_

---

<a id="page-projects-proj-1-design"></a>

#### Design (Diseño) — 2 items

##### Item 29 · 2026-04-15 · ✅ Completed (Completado)

> Sumar a la vista del cliente un espacio de notas/ consultas al lado del chat bot

**Refs:** Task #24

**Why (Por qué):** Client notes/queries panel beside the chat shipped as part of #24.

**Por qué (Why):** El panel de notas/consultas del cliente junto al chat se entregó como parte de #24.


---

##### Item 18 · 2026-04-15 · ⏳ Pending (Pendiente)

> Este gris oscuro es demasiado oscuro me parece; usar gris KONTi de marca https://drive.google.com/drive/folders/12JZdXlT1zTE8tBLS9S51O1NJXR1G_YJ2

**Refs:** —

**Why (Por qué):** A KONTi-branded gray (vs. the current dark) is not yet applied — related to #2 and #97.

**Por qué (Why):** Aún no se aplicó un gris de marca KONTi (vs. el oscuro actual) — relacionado con #2 y #97.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-87178ef9-c635-45d8-8308-32c375b7c52c-img-0) (asset: `1776268018090_025141ced2c5e538eb316dfc9fc0ab24.png`)_

---

<a id="page-projects-proj-2"></a>

### https://konti-demo.replit.app/projects/proj-2

<a id="page-projects-proj-2-feature-request"></a>

#### Feature request (Solicitud de funcionalidad) — 2 items

##### Item 9 · 2026-04-15 · ✅ Completed (Completado)

> Gonza, creo que es importante poder desglosar cada fase en subpasos visibles, con estado, avance, responsable y próximo hito. El cronograma debe desglosarse en los pasos de cada fase porque si no el avance se percibe muy lento. Tambien le sumaria fechas de cambio de cada uno

**Refs:** Task #11

**Why (Por qué):** The 9-phase validator-driven rework broke each phase into visible sub-steps with status, dates and gates.

**Por qué (Why):** La reestructuración de 9 fases dividió cada fase en sub-pasos visibles con estado, fechas y puertas.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-7e01d5af-5641-4e15-8943-79a631ac77de-img-0) (asset: `1776266533543_4df3f90df265096e37005c9a53cbbbda.png`)_

---

##### Item 6 · 2026-04-15 · ✅ Completed (Completado)

> No me deja hacer click para ver los documentos

**Refs:** Task #7

**Why (Por qué):** Documents panel was made richer and clickable as part of weather + documents work.

**Por qué (Why):** El panel de documentos se hizo más rico y clickeable junto con el trabajo de clima + documentos.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-e6004d1a-d4aa-4b36-92e5-c4db68e5cb1c-img-0) (asset: `1776266246105_55338c49c340f499c457bc8472848a0e.png`)_

---

<a id="page-projects-proj-2-bug-report"></a>

#### Bug report (Reporte de bug) — 1 item

##### Item 46 · 2026-04-15 · ✅ Completed (Completado)

> Intente crear un proyecto pero no se guardó y no lo encuentro

**Refs:** Task #21

**Why (Por qué):** Project creation save bug fixed in #21.

**Por qué (Why):** El bug de guardado al crear proyecto se corrigió en #21.


---

<a id="page-projects-proj-2-report"></a>

### https://konti-demo.replit.app/projects/proj-2/report

<a id="page-projects-proj-2-report-design"></a>

#### Design (Diseño) — 1 item

##### Item 8 · 2026-04-15 · 🟡 In progress / scheduled (En progreso / programado)

> Poder editar las fechas de reportes y que aparezcan los reportes generados a un costado para imprimirlos o descargarlos la cantidad de veces que quisiéramos.

**Refs:** Task #4, Task #29

**Why (Por qué):** PDF export shipped (#4); using the saved template when exporting and keeping a side history of generated reports is scheduled in #29.

**Por qué (Why):** La exportación a PDF ya se entregó (#4); usar la plantilla guardada y mantener un historial lateral está programado en #29.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-7fb095a7-6716-4006-bafa-1d03e7618e35-img-0) (asset: `1776266469581_28c2a517fda111f80d931ca32daeabf5.png`)_

---

<a id="page-projects-proj-3"></a>

### https://konti-demo.replit.app/projects/proj-3

<a id="page-projects-proj-3-design"></a>

#### Design (Diseño) — 1 item

##### Item 28 · 2026-04-15 · ✅ Completed (Completado)

> sumar popup de notificaciones para el cliente

**Refs:** Task #24, Task #26

**Why (Por qué):** Client-side notifications popup shipped in #24; the bell button was polished in #26.

**Por qué (Why):** Se entregó el popup de notificaciones del cliente en #24; el botón de campana se pulió en #26.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-bb9fe528-9db3-48ae-8968-6eca690e219c-img-0) (asset: `1776277944207_038d55e44151d61b863713c90ec50048.png`)_

---

<a id="page-projects-proj-1776983841174"></a>

### https://konti-demo.replit.app/projects/proj-1776983841174

<a id="page-projects-proj-1776983841174-content"></a>

#### Contenido / Copy (Content) — 5 items

##### Item 81 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> if this is how i send the clients docuements they need to sign, does this generate an email like we spoke automatically so that they get the notification explaining what the docuemnt is and what we need from them?

**Refs:** —

**Why (Por qué):** Auto-emailing clients for signature requests is a notification/email integration; needs scoping.

**Por qué (Why):** El envío automático de correos para firmas del cliente requiere integración de notificaciones; necesita alcance.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-b1312d6c-1169-4678-82a8-b62c07fddb47-img-0) (asset: `1776984762030_a907b4a9ef117073f87f261b07c9a25a.png`)_

---

##### Item 80 · 2026-04-23 · ⏳ Pending (Pendiente)

> how do you categorize the document? permits, punchlist, drawings, etc?

**Refs:** —

**Why (Por qué):** Document categorization (permits / punchlist / drawings / etc.) is not yet built.

**Por qué (Why):** Aún no existe la categorización de documentos (permisos/punchlist/planos/etc.).

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-38f1a160-9197-41f4-aed1-338fdbb56ab0-img-0) (asset: `1776984708178_df29188ef83ec73e2cfd3bd468834d76.png`)_

---

##### Item 79 · 2026-04-23 · ⏳ Pending (Pendiente)

> ver documento de punchlist.. deberiamos poder ver las mismas categorias items, y links a las fotos del dive para que el cliente pueda visualizar su proyecto sin tener que visitar el site

**Refs:** —

**Why (Por qué):** Aligning the punchlist categories/items and Drive photo links to the team's spreadsheet is not yet planned — overlaps with #68, #90.

**Por qué (Why):** Aún no se planifica alinear categorías/ítems del punchlist y los links a fotos del Drive con la hoja del equipo — se solapa con #68, #90.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-36d51674-91bb-46d9-ba42-123428327e52-img-0) (asset: `1776984608098_99d4721dbe1297030fd6ab680b9f0917.png`)_

---

##### Item 78 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> se supone que esto es para añadir mas items especiales al punchlist que va a estar completo aqui segun el documento?

**Refs:** —

**Why (Por qué):** Clarification on the special punchlist items field — needs a walkthrough.

**Por qué (Why):** Aclaración sobre el campo de ítems especiales del punchlist — requiere recorrido.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-61080844-c556-4c2b-bcf4-aad49b5867e3-img-0) (asset: `1776984520464_d0da0b18b89e46f7859f8c0600284951.png`)_

---

##### Item 77 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> no entiendo que hace esto? que es lo que calcula en base a zoning y tipo de proyecto?

**Refs:** —

**Why (Por qué):** Clarification on what the zoning/project-type calculator computes — needs a walkthrough.

**Por qué (Why):** Aclaración sobre qué calcula el panel por zoning/tipo — requiere recorrido.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-336e50b8-a006-4629-82ae-c4e31c23c343-img-0) (asset: `1776984434114_8bc0de517e4984edec2fd0414f6bb154.png`)_

---

<a id="page-projects-proj-1776983841174-other"></a>

#### Other (Otro) — 1 item

##### Item 76 · 2026-04-23 · ⏳ Pending (Pendiente)

> private to who? el team debe tener total visibilidad.. los clientes no

**Refs:** —

**Why (Por qué):** Document/note 'private' visibility needs to default to team-only and never show to clients — overlaps with #26.

**Por qué (Why):** La visibilidad 'privado' debe ser por defecto sólo equipo y nunca cliente — se solapa con #26.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-64a06245-caf3-45e9-9b44-2b0f8ef94cad-img-0) (asset: `1776983968003_1130169c9235a88135a935f20c48e509.png`)_

---

<a id="page-projects-proj-1776983841174-bug-report"></a>

#### Bug report (Reporte de bug) — 1 item

##### Item 82 · 2026-04-23 · ⏳ Pending (Pendiente)

> maybe es por ser el demo pero no me deja upload nada

**Refs:** Task #27, Task #30, Task #32

**Why (Por qué):** Upload not persisting is a known limitation of the demo's in-memory data; persistence is scheduled in #27, #30, #32.

**Por qué (Why):** Que la carga no se guarde es una limitación conocida del demo en memoria; la persistencia está programada en #27, #30, #32.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-8ef1a5c6-6121-46b7-8290-2fbdd9bd6b61-img-0) (asset: `1776984976211_9b8bbacda96c91fed7ef96c872b04435.png`)_

---

<a id="page-dashboard"></a>

### https://konti-demo.replit.app/dashboard

<a id="page-dashboard-design"></a>

#### Design (Diseño) — 1 item

##### Item 1 · 2026-04-15 · ✅ Completed (Completado)

> Logo deformado en el admin

**Refs:** Task #5, Task #8, Task #36

**Why (Por qué):** Login logo and sidebar logo were corrected and the menatech footer added.

**Por qué (Why):** Se corrigió el logo del login y de la barra lateral y se añadió el pie de menatech.


---

<a id="page-dashboard-feature-request"></a>

#### Feature request (Solicitud de funcionalidad) — 1 item

##### Item 5 · 2026-04-15 · ⏳ Pending (Pendiente)

> Me gusta esta sección. Le sumaria la posibilidad de hacer click en las actividades e ir a ver detalles

**Refs:** —

**Why (Por qué):** Activity items in the dashboard feed are not yet click-through to detail.

**Por qué (Why):** Las actividades del feed del dashboard aún no son clickeables al detalle.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-ddc0e9f0-3163-4557-b7c2-547bbb81a1b7-img-0) (asset: `1776266192146_0fc70b4b47357b0d4f8e0b0ddf6069b0.png`)_

---

<a id="page-dashboard-other"></a>

#### Other (Otro) — 1 item

##### Item 47 · 2026-04-15 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> Grabar video demo, para compartir antes para que vayan a la reunion con las preguntas listas

**Refs:** —

**Why (Por qué):** Process item (record a demo video) — not a product change.

**Por qué (Why):** Ítem de proceso (grabar un video demo) — no es un cambio de producto.


---

<a id="page-dashboard-content"></a>

#### Contenido / Copy (Content) — 1 item

##### Item 48 · 2026-04-23 · 🟡 In progress / scheduled (En progreso / programado)

> entendemos que esta parte deberia ir dentro de los proyectos y lo primero que vemos en el dashboard debe ser solamente active projects y recent activity. lo que esta en el screenshot debe estar dentro de cada proyecto y especifica para cada proyecto, no juntando la data de cada proyecto. Es overwhelming ver el total de todos los proyectos.

**Refs:** Task #18

**Why (Por qué):** Showing only the construction-status card on the client home is scheduled in #18; the broader 'move overall stats into per-project' restructure is still pending.

**Por qué (Why):** Mostrar sólo la tarjeta de estado de construcción en el home del cliente está programado en #18; la reestructuración más amplia sigue pendiente.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-c02cc055-3eb1-404f-bd95-465b7e1343e2-img-0) (asset: `1776976478039_12f8e026e5f4ae8a213b70f74839a708.png`)_

---

<a id="page-calculator"></a>

### https://konti-demo.replit.app/calculator

<a id="page-calculator-content"></a>

#### Contenido / Copy (Content) — 7 items

##### Item 60 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> lo que necesitamos es que tengamos una sola calculadora con toda la data que sale en el excell de jorge y que cada proyecto cree una copia editable... no estamos seguros como eso ocurre aqui en estos momentos.

**Refs:** —

**Why (Por qué):** 'One master calculator that each project copies' is a workflow design that needs a product call before building.

**Por qué (Why):** 'Una calculadora maestra que cada proyecto copia' es un diseño de flujo que requiere una decisión de producto.


---

##### Item 58 · 2026-04-23 · ⏳ Pending (Pendiente)

> que es effective?

**Refs:** —

**Why (Por qué):** Copy clarification ('what is effective?') has not been addressed.

**Por qué (Why):** No se atendió la aclaración de copia ('qué es effective?').

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-703a8723-e59c-484a-b366-cc459044c8cb-img-0) (asset: `1776981288104_ca229083afe1838a9fae040e59ca809a.png`)_

---

##### Item 57 · 2026-04-23 · ⏳ Pending (Pendiente)

> deben salir todos los materiales automaticamente... esto es lo que nos confunde de la parte de imports? se supone que se reflejen aqui?

**Refs:** —

**Why (Por qué):** Auto-populating all materials from import (vs. selecting one-by-one) is not yet planned — overlaps with #82.

**Por qué (Why):** Aún no se planifica auto-popular todos los materiales tras la importación — se solapa con #82.


---

##### Item 56 · 2026-04-23 · ⏳ Pending (Pendiente)

> esto se deberia ver como nuestro estimado con las secciones y resumenes y categorias organizadas. (ej - los costos de diseño, permisos, taxes and gov fees no estan saliendo) 
> 
> la informacion que sale dentro de los estimados debe salir aqui completa.

**Refs:** —

**Why (Por qué):** Surfacing design / permits / taxes / gov-fees lines in the calculator summary is not yet planned.

**Por qué (Why):** Aún no se planifica mostrar diseño/permisos/impuestos/tasas en el resumen de la calculadora.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-4ea26923-f280-4a56-b14e-ab7eb4cb78aa-img-0) (asset: `1776980945011_79a32743b831d32cf2d86c20358f6023.png`)_

---

##### Item 55 · 2026-04-23 · ⏳ Pending (Pendiente)

> contractor calculator? la info de abajo suena mas como project information.. maybe esto es como la data del proyecto?  
> cantidad de baños, pies cuadrados, contingencia, margen, cantidad de cocinas, cantidad de vagones,

**Refs:** —

**Why (Por qué):** Renaming/restructuring 'Contractor calculator' inputs into a 'Project information' panel is not yet planned.

**Por qué (Why):** Aún no se planifica renombrar/reestructurar los inputs de 'Contractor calculator' como 'Información del proyecto'.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-cd500187-1618-4e47-8deb-3fe645236dd2-img-0) (asset: `1776980622914_ef06ef43c62ef573592cc2d62657dfc6.png`)_

---

##### Item 54 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> esto es para que nosotros ahora lo hagamos y ustedes puedan trabajar el template? no entendemos como funciona esto

**Refs:** —

**Why (Por qué):** Workflow clarification about who maintains the template — needs a product call.

**Por qué (Why):** Aclaración de flujo sobre quién mantiene la plantilla — requiere decisión de producto.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-9c9c8ec6-cc71-459d-8181-3682e885a358-img-0) (asset: `1776980474473_80ec5ec1bef7c3fade7b6a5e33f012cf.png`)_

---

##### Item 53 · 2026-04-23 · ⏳ Pending (Pendiente)

> intentamos importar el CSV de nuestro estimado inicial sheet de materiales. pero sale medio algarete... entiendo que el formato de las columnas no esta matching a nuestros estimados. 
> 
> Recuerda que el proposito de esta calculadora es que desde el principio podamos tener un estimado basado en los averages de nuestra data historica y que al el proyecto seguir prograsando nosotros podamos editarla. Usando los project reports 
> 
> Upload endpoit + translation? 
> 
> la idea es que esta calculadora se trabaje una vez y yo cambiando pies cuadrados pueda tener un buen estimado y luego que se convierta en poryecto podamos ir editando materiales y añadiendo materiales y labor especificos a ese proyecto. 
> 
> creo que esto lo debemos hablar mas en detalle

**Refs:** —

**Why (Por qué):** CSV import was shipped (#22) but the column mapping does not match the team's estimating template; alignment is still pending.

**Por qué (Why):** La importación CSV se entregó (#22) pero el mapeo de columnas no coincide con la plantilla del equipo; falta alinearlo.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-b7daf9a6-f855-4539-bb69-416abef9cfc0-img-0) (asset: `1776979805597_92d1d0770cc16441c44760974c11daf8.png`)_

---

<a id="page-calculator-other"></a>

#### Other (Otro) — 3 items

##### Item 34 · 2026-04-15 · 🟡 In progress / scheduled (En progreso / programado)

> Nos pasan el reporte formato para subirlo y que quede con ese formato

**Refs:** Task #22, Task #29

**Why (Por qué):** Report-template upload shipped in #22; using that template when exporting the project PDF is scheduled in #29.

**Por qué (Why):** La carga de la plantilla del reporte se entregó en #22; su uso al exportar el PDF está programado en #29.


---

##### Item 33 · 2026-04-15 · ✅ Completed (Completado)

> Ver los reportes de los proyectos actuales del estimado a lo gastado

**Refs:** Task #22

**Why (Por qué):** Variance reports (estimated vs. spent) shipped in #22.

**Por qué (Why):** Los reportes de variación (estimado vs. gastado) se entregaron en #22.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-f9377a16-4522-4106-a042-aff9a09b148b-img-0) (asset: `1776278693400_18106f392902a679cc78f1bf9cbe98b6.png`)_

---

##### Item 32 · 2026-04-15 · ✅ Completed (Completado)

> Sumar calculadora de contratista - tomar en cuenta el documento inicial preliminar

**Refs:** Task #22

**Why (Por qué):** Contractor estimate calculator shipped in #22.

**Por qué (Why):** La calculadora del estimado del contratista se entregó en #22.


---

<a id="page-calculator-design"></a>

#### Design (Diseño) — 2 items

##### Item 30 · 2026-04-15 · ✅ Completed (Completado)

> Se puede editar las categorías. Nos van a pasar un excel con las categorias, unidades y materiales

**Refs:** Task #22

**Why (Por qué):** Editable categories with Excel/CSV import shipped in the calculator overhaul (#22).

**Por qué (Why):** Las categorías editables con importación Excel/CSV se entregaron en la revisión de la calculadora (#22).

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-0c2e3c84-18d6-411f-8562-ced5973f0af6-img-0) (asset: `1776278454261_c8d324308dba647cea71d8f2216cf86d.png`)_

---

##### Item 10 · 2026-04-15 · ✅ Completed (Completado)

> No me lo traduce a español

**Refs:** Task #3

**Why (Por qué):** Language toggle (EN/ES) was wired across the app, including the calculator copy.

**Por qué (Why):** Se cableó el selector de idioma EN/ES en toda la app, incluyendo la calculadora.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-95886c35-82f3-42ff-9773-9c5ebcde1cd2-img-0) (asset: `1776266957959_c1846f925b2e9d981baa4bac753efb69.png`)_

---

<a id="page-calculator-feature-request"></a>

#### Feature request (Solicitud de funcionalidad) — 2 items

##### Item 59 · 2026-04-23 · ⏳ Pending (Pendiente)

> necesitamos poder editar base price, quantitiy,

**Refs:** —

**Why (Por qué):** Editable base price and quantity in the calculator are not yet exposed in the UI.

**Por qué (Why):** Aún no están editables en la UI el precio base y la cantidad en la calculadora.


---

##### Item 31 · 2026-04-15 · ✅ Completed (Completado)

> Para la mano de obra/labor: nos pasan una base de datos, excel para que lo calcule la mano de obra

**Refs:** Task #22

**Why (Por qué):** Labor rates with CSV import shipped in #22.

**Por qué (Why):** Las tarifas de mano de obra con importación CSV se entregaron en #22.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-796a71b5-0d11-4cf5-afb4-f8571befe4d0-img-0) (asset: `1776278526302_e46a8699ec0897bde4ac01c579e287a1.png`)_

---

<a id="page-calculator-projectid-proj-1-tab-variance"></a>

### https://konti-demo.replit.app/calculator?projectId=proj-1&tab=variance

<a id="page-calculator-projectid-proj-1-tab-variance-content"></a>

#### Contenido / Copy (Content) — 4 items

##### Item 69 · 2026-04-23 · ⏳ Pending (Pendiente)

> we need a place to import the site photos for the weekly report and punchlist. not sure where this is?
> 
> these should also be able to be categorized so they can get saved in the drive as : 
> 
> process photos (internal), or punchlist photos (client view) 
> 
> then they need to get categorized by task type (plubming, electric, foundation, etc... ) see item categories in Punchlist excell

**Refs:** —

**Why (Por qué):** A site-photo import for weekly report and punchlist (with internal/client categories and task-type tags) is not yet planned.

**Por qué (Why):** Aún no se planifica la importación de fotos de obra para el reporte semanal y el punchlist (con categorías internas/cliente y etiquetas por tipo de tarea).


---

##### Item 51 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> no entedemos este tab tampoco..

**Refs:** —

**Why (Por qué):** Same clarification request — needs a walkthrough.

**Por qué (Why):** Misma pregunta de aclaración — requiere recorrido.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-8b5dd6db-a935-4002-a3a2-dfc19f94e0f6-img-0) (asset: `1776978544523_fa0fc7f8359089d379d9ef17cf3e44dc.png`)_

---

##### Item 50 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> cual es la funcionalidad de esta seccion? no entiendo lo que va a alimentar?

**Refs:** —

**Why (Por qué):** Clarification request about the variance tab — needs a walkthrough rather than code.

**Por qué (Why):** Pregunta de aclaración sobre la pestaña de variación — requiere recorrido, no cambio de código.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-b1bf1d48-e963-4943-8e25-6cb34d72bb5b-img-0) (asset: `1776978459582_8f74ce79532171b2332e5a2e73397dac.png`)_

---

##### Item 49 · 2026-04-23 · ⏳ Pending (Pendiente)

> esto deberia vivir en el dashboard para que Naino no tenga que encontrar esta pagina (que esta dificil de llegar a ella) para poder subir los recibos y categorizarlos. 
> 
> Project Name
> Categoria 
> Subcategoria 
> etc
> 
> (ver excell de Jorge del project report) La idea de esta sección clasifique los recibos y las cantidades directamente dentro de este excell para que entonces el reporte pueda halar la informacion

**Refs:** —

**Why (Por qué):** Lifting the receipts/categorization workflow into the dashboard so it's discoverable is not yet planned.

**Por qué (Why):** Aún no se planifica subir el flujo de recibos/categorización al dashboard para que sea fácil de encontrar.


---

<a id="page-calculator-projectid-proj-1776983841174-tab-variance"></a>

### https://konti-demo.replit.app/calculator?projectId=proj-1776983841174&tab=variance

<a id="page-calculator-projectid-proj-1776983841174-tab-variance-content"></a>

#### Contenido / Copy (Content) — 1 item

##### Item 83 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> nos parece que esto significa que cada vez que queremos hacer un estimado hay que seleccionar cada material individualmente??? si es asi definitivamente no nos ayuda. La carta de materiales a cada proyecto debe ser estandar y editable pero no partir de cero. maybe no entendemos como es que va a funcionar..

**Refs:** —

**Why (Por qué):** Workflow clarification on whether each estimate selects materials individually — needs a product call. Overlaps with #56, #59.

**Por qué (Why):** Aclaración sobre si cada estimado selecciona materiales uno por uno — requiere decisión de producto. Se solapa con #56, #59.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-807e6d74-37e9-4062-a53c-770dd5d6be89-img-0) (asset: `1776985017649_e1336acd9bbadded4938a9ad85a483d4.png`)_

---

<a id="page-materials"></a>

### https://konti-demo.replit.app/materials

<a id="page-materials-content"></a>

#### Contenido / Copy (Content) — 2 items

##### Item 52 · 2026-04-23 · ⏳ Pending (Pendiente)

> nosotros no trabajamos por hora. si miramos el reporte de Jorge, esta la labor por lump sums.. creo que aqui esta la confusion con estos tabs.

**Refs:** —

**Why (Por qué):** Lump-sum labor model (vs. hourly) is a calculator data-model change and not yet planned.

**Por qué (Why):** El modelo de mano de obra por suma alzada (vs. por hora) es un cambio en el modelo de datos y no está planificado.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-23e87ef3-ee64-47b1-976f-0312a1846da2-img-0) (asset: `1776978601451_ec5e651c878d4eccb5d84ca19234c55e.png`)_

---

##### Item 2 · 2026-04-15 · ⏳ Pending (Pendiente)

> Agregar botón de AÑADIR MATERIALES

**Refs:** —

**Why (Por qué):** No 'Add material' button on the materials library yet — page is read-only catalog today.

**Por qué (Why):** Aún no existe el botón 'Añadir material' en la biblioteca; la página es un catálogo de solo lectura.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-a2b0e2fa-7cff-4117-8161-7241a7fa3000-img-0) (asset: `1776266094348_beddacd32479761eaf76795b2d6975d9.png`)_

---

<a id="page-materials-other"></a>

#### Other (Otro) — 1 item

##### Item 35 · 2026-04-15 · ⏳ Pending (Pendiente)

> Para el contratista, subir los ultimos 3 recibos y que tome esto para actualizar el listado de caculadora de mano de obra

**Refs:** Task #28

**Why (Por qué):** Auto-updating labor rates from receipts is not yet built; real OCR for receipts is scheduled in #28 and is a prerequisite.

**Por qué (Why):** Aún no se construye la auto-actualización de tarifas desde recibos; el OCR real de recibos (requisito) está programado en #28.


---

<a id="page-permits"></a>

### https://konti-demo.replit.app/permits

<a id="page-permits-content"></a>

#### Contenido / Copy (Content) — 5 items

##### Item 89 · 2026-04-23 · ⏳ Pending (Pendiente)

> la primera pagina del excell de permiso tiene la data legal del proyecto y todos los ingenieros que trabajaron en el mismo. eso es sumamente importante que salga aqui para lo que podamos llenar

**Refs:** —

**Why (Por qué):** The legal/engineer header from the team's permit spreadsheet is not yet exposed in the permits view.

**Por qué (Why):** Aún no se expone en Permisos la cabecera legal/ingenieros que tiene la hoja del equipo.


---

##### Item 88 · 2026-04-23 · ⏳ Pending (Pendiente)

> we have the permits docs separated in the excell sheet by type of permit : PCOC, USO, Consulta de Ubicacion, etc. Can we do this here?

**Refs:** —

**Why (Por qué):** Splitting permits by type (PCOC, USO, Consulta de Ubicación, etc.) is not yet built.

**Por qué (Why):** Aún no se separan los permisos por tipo (PCOC, USO, Consulta de Ubicación, etc.).

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-acd704c5-372b-4d46-9a49-51a213cc8e46-img-0) (asset: `1776985688314_d22b72b5e06c23a45fe16f313f226456.png`)_

---

##### Item 87 · 2026-04-23 · ⏳ Pending (Pendiente)

> this should say "Permit Documentation"

**Refs:** —

**Why (Por qué):** Copy change to 'Permit Documentation' has not been applied yet.

**Por qué (Why):** Aún no se aplicó el cambio de copia a 'Permit Documentation'.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-846cc9bc-3ef4-4693-a50d-ce067ceb970a-img-0) (asset: `1776985621842_f00466055a880253158dd1b5b5494375.png`)_

---

##### Item 86 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> once approved and final document is uploaded either to a folder in the drive where this system can match it? how does the client download the final document?

**Refs:** —

**Why (Por qué):** Clarification on final-document distribution (Drive sync, client download) — needs scoping.

**Por qué (Why):** Aclaración sobre la distribución del documento final (sync con Drive, descarga del cliente) — requiere alcance.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-c9e76c5f-16e3-474f-8d9b-aa1755425fc9-img-0) (asset: `1776985512239_515c7a3e6eb5136ea5ac9706ede80835.png`)_

---

##### Item 85 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> are these required signatures form the client only? how do we upload the documents? or is this reading the excell sheet in the drive?

**Refs:** —

**Why (Por qué):** Clarification on permit-doc upload and signature flow — needs a walkthrough.

**Por qué (Why):** Aclaración sobre carga y firma de documentos de permiso — requiere recorrido.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-d7236536-9fd3-47cd-a5bd-fe68366ab003-img-0) (asset: `1776985443132_8fe72292fb713adb7a8ddbd5b98b5a48.png`)_

---

<a id="page-permits-feature-request"></a>

#### Feature request (Solicitud de funcionalidad) — 1 item

##### Item 38 · 2026-04-15 · ✅ Completed (Completado)

> Sumar una sección de Diseño

**Refs:** Task #26

**Why (Por qué):** Permits 'Diseño' section was added in the polish bundle (#26).

**Por qué (Why):** La sección de 'Diseño' en Permisos se añadió en el bundle de pulido (#26).

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-a65f7f80-7dc2-41f8-b843-b24098e25899-img-0) (asset: `1776279118645_cfdf0926e78682edc2e57bc61f912bf0.png`)_

---

<a id="page-permits-other"></a>

#### Other (Otro) — 1 item

##### Item 84 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> esto esta leyendo el drive?

**Refs:** —

**Why (Por qué):** Drive integration question — needs scoping.

**Por qué (Why):** Pregunta de integración con Drive — requiere alcance.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-d4124aff-1f11-4346-a9ce-07fc9d799bc5-img-0) (asset: `1776985307331_0ce68d68b5312aa8f55db7193ef6b2df.png`)_

---

<a id="page-team"></a>

### https://konti-demo.replit.app/team

<a id="page-team-design"></a>

#### Design (Diseño) — 2 items

##### Item 37 · 2026-04-15 · ✅ Completed (Completado)

> Eliminar

**Refs:** Task #35 (commit `9de748f`)

**Why (Por qué):** Team member entry was removed during the team-page edits.

**Por qué (Why):** La entrada del miembro fue removida en las ediciones del directorio.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-4e1a625e-a213-4e12-ada4-5f6fab0dc1e0-img-0) (asset: `1776279100985_8a04ecb5fb865f40f044492af0ddaef6.png`)_

---

##### Item 36 · 2026-04-15 · ✅ Completed (Completado)

> Cambiar a Nainoshka

**Refs:** Task #35 (commit `9de748f`)

**Why (Por qué):** Team member name updated to Nainoshka in seed data and AI knowledge base.

**Por qué (Why):** Se actualizó el nombre del miembro a Nainoshka en datos semilla y base de conocimiento de IA.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-4538cb40-1882-4c0e-a9ea-be12707a9857-img-0) (asset: `1776279089942_23c0290b36a71d429c0b779faa9556a9.png`)_

---

<a id="page-team-content"></a>

#### Contenido / Copy (Content) — 1 item

##### Item 61 · 2026-04-23 · ⏳ Pending (Pendiente)

> deberiamos poder upload personas nuevas para que tengamos el directorio de los contratistas y podamos ir uploading la informacion de ellos... 
> 
> a menos que esto sea solamente users de la plataforma??

**Refs:** —

**Why (Por qué):** Uploading new people (contractor directory, not platform users) is not yet built.

**Por qué (Why):** Aún no existe la carga de personas nuevas (directorio de contratistas, no usuarios de la plataforma).


---

<a id="page-ai"></a>

### https://konti-demo.replit.app/ai

<a id="page-ai-other"></a>

#### Other (Otro) — 7 items

##### Item 72 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> is this supposed to be how we communitcate change orders, material specs and such?

**Refs:** —

**Why (Por qué):** Clarification on whether the AI is the channel for change orders / specs — needs a product call.

**Por qué (Why):** Aclaración sobre si la IA es el canal para órdenes de cambio / specs — requiere decisión de producto.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-765130f3-9733-4432-8700-9bc673dfdb95-img-0) (asset: `1776983652786_bad4759796217d64f68cb4421f43926f.png`)_

---

##### Item 45 · 2026-04-15 · ✅ Completed (Completado)

> Para clasificar las fotos/comentarios: que la Ia te solicite una check para realizarlo

**Refs:** Task #23

**Why (Por qué):** Confirm-before-classify shipped in the AI UX upgrade #23.

**Por qué (Why):** La confirmación antes de clasificar se entregó en la mejora UX de IA #23.


---

##### Item 43 · 2026-04-15 · 🟡 In progress / scheduled (En progreso / programado)

> Sumar el punchlist como checklist para pasar de etapas

**Refs:** Task #25, Task #32

**Why (Por qué):** Punchlist as a phase-advance gate shipped (#25); punchlist persistence across server restarts is scheduled (#32).

**Por qué (Why):** El punchlist como compuerta para avanzar de fase fue entregado (#25); la persistencia del punchlist entre reinicios está programada (#32).


---

##### Item 42 · 2026-04-15 · ✅ Completed (Completado)

> Integrar el audio de voz al asistente de Ia (para luego dejar las notas de acciones)

**Refs:** Task #23

**Why (Por qué):** Voice notes integration shipped in #23.

**Por qué (Why):** La integración de notas de voz se entregó en #23.


---

##### Item 41 · 2026-04-15 · ✅ Completed (Completado)

> Crear en el bot de especificaciones un reporte de actualizaciones y graficas

**Refs:** Task #23

**Why (Por qué):** Spec-updates report shipped in #23.

**Por qué (Why):** El reporte de actualizaciones de especificación se entregó en #23.


---

##### Item 40 · 2026-04-15 · 🟡 In progress / scheduled (En progreso / programado)

> Armar notas de las preguntas realizadas por el cliente

**Refs:** Task #23, Task #30

**Why (Por qué):** Notes-from-client-questions UI shipped (#23); persistence across server restarts is scheduled (#30).

**Por qué (Why):** UI de notas de preguntas del cliente entregada (#23); la persistencia entre reinicios está programada (#30).

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-a3339bb9-2623-43a8-9ea3-45b758ed99f7-img-0) (asset: `1776279400286_325f324e37c5fa927b40f016dd6bf879.png`)_

---

##### Item 39 · 2026-04-15 · ✅ Completed (Completado)

> Mejorar la visual del texto que nos brinda la Asistente IA

**Refs:** Task #23

**Why (Por qué):** Markdown rendering for the AI assistant shipped in #23.

**Por qué (Why):** La renderización Markdown del asistente IA se entregó en #23.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-3014b3c9-f9f7-4ed8-9f10-e1d2406a5e3c-img-0) (asset: `1776279289572_3bffd05759287f507f0215250adf9f72.png`)_

---

<a id="page-ai-design"></a>

#### Design (Diseño) — 1 item

##### Item 44 · 2026-04-15 · ✅ Completed (Completado)

> Botón de notificaciones no se llega a ver completo

**Refs:** Task #26, Task #36

**Why (Por qué):** Notification button visibility was fixed in #26 and the sidebar/header was polished in #36.

**Por qué (Why):** La visibilidad del botón de notificaciones se corrigió en #26 y la barra lateral/encabezado se pulió en #36.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-0caa0128-d9d4-4bcd-bcbc-fed8092c56f0-img-0) (asset: `1776279632902_636286b786b537c2a7788b792c3078cf.png`)_

---

<a id="page-ai-feature-request"></a>

#### Feature request (Solicitud de funcionalidad) — 1 item

##### Item 70 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> is this bot only to ask questions on KONTi side? i thought it was supposed to help Nai write the weekly reports on site?

**Refs:** —

**Why (Por qué):** Scope clarification on what the AI should do (KONTi vs. on-site reports) — needs a product call.

**Por qué (Why):** Aclaración de alcance del asistente IA (KONTi vs. reportes en obra) — requiere decisión de producto.


---

<a id="page-ai-content"></a>

#### Contenido / Copy (Content) — 1 item

##### Item 71 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> where does this information get updated or requested to the client?

**Refs:** —

**Why (Por qué):** Clarification on how info flows back to the client — needs a walkthrough.

**Por qué (Why):** Aclaración sobre cómo la información llega al cliente — requiere recorrido.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-608a24e1-92c5-4103-a6e5-8e4460fd69bf-img-0) (asset: `1776983587927_85e99365b1d79b3950e359d4081e1715.png`)_

---

<a id="page-leads"></a>

### https://konti-demo.replit.app/leads

<a id="page-leads-content"></a>

#### Contenido / Copy (Content) — 3 items

##### Item 75 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> ok me parece que esta conectado a asana y veo que de aqui los puedo crear a un proyecto nuevo cuando aceptan propuesta... la pregunta es en asana se crea el proyecto en base al template? no entiendo como funcioana

**Refs:** —

**Why (Por qué):** Asana template-driven project creation — third-party integration question, needs scoping.

**Por qué (Why):** Creación de proyectos en base a plantilla en Asana — pregunta de integración, requiere alcance.


---

##### Item 74 · 2026-04-23 · ⏳ Pending (Pendiente)

> que son estos scores?

**Refs:** —

**Why (Por qué):** The lead-score copy needs an in-page legend explaining what the score means.

**Por qué (Why):** La copia del score de leads necesita una leyenda en la página explicando qué significa.

_Screenshot (Captura): [Screenshot 1](https://5ad98f17-de16-4057-90b7-eb39bee4dbc3-00-7zq0uc6bszhd.spock.replit.dev/inbox#item-1cb18438-3228-4df5-925f-fdc4ebebe256-img-0) (asset: `1776983821032_40a20c39ef82b0c627e179185e209695.png`)_

---

##### Item 73 · 2026-04-23 · 💬 Out of scope / needs discussion (Fuera de alcance / requiere conversación)

> no entiendo esta pagina? se supone que sea un crm? o esta conectado a asana y eso son los proyectos que van entrando a propuesta?

**Refs:** —

**Why (Por qué):** Clarification about the leads page being a CRM vs. Asana mirror — needs a walkthrough.

**Por qué (Why):** Aclaración sobre si la página de leads es un CRM vs. espejo de Asana — requiere recorrido.


---

<a id="pending-appendix"></a>

## Pending — Not Yet Planned (Pendientes — Aún sin planificar)

These items are open and not yet linked to a project task. Listed by topic, then date.

Estos ítems están abiertos y aún no están vinculados a una tarea de proyecto. Listados por tema y luego por fecha.

### Contenido / Copy (Content) (27)

- _Item 95 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Copy change ('weather status') has not been applied.
- _Item 94 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Removing numbers from the macro phases on the report (so they don't conflict with construction-phase numbering) is not yet planned.
- _Item 93 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — A 'phase pie chart vs. budget' visualization on the report is not yet planned.
- _Item 92 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Aligning the client report categories one-to-one with the team's spreadsheet is not yet planned — overlaps with #66.
- _Item 91 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Embedding the punchlist with photo links and the contractor-monitoring narrative on the report is not yet planned — overlaps with #14, #78.
- _Item 89 · 2026-04-23 · https://konti-demo.replit.app/permits_ — The legal/engineer header from the team's permit spreadsheet is not yet exposed in the permits view.
- _Item 88 · 2026-04-23 · https://konti-demo.replit.app/permits_ — Splitting permits by type (PCOC, USO, Consulta de Ubicación, etc.) is not yet built.
- _Item 87 · 2026-04-23 · https://konti-demo.replit.app/permits_ — Copy change to 'Permit Documentation' has not been applied yet.
- _Item 80 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1776983841174_ — Document categorization (permits / punchlist / drawings / etc.) is not yet built.
- _Item 79 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1776983841174_ — Aligning the punchlist categories/items and Drive photo links to the team's spreadsheet is not yet planned — overlaps with #68, #90.
- _Item 74 · 2026-04-23 · https://konti-demo.replit.app/leads_ — The lead-score copy needs an in-page legend explaining what the score means.
- _Item 69 · 2026-04-23 · https://konti-demo.replit.app/calculator?projectId=proj-1&tab=variance_ — A site-photo import for weekly report and punchlist (with internal/client categories and task-type tags) is not yet planned.
- _Item 67 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Restructuring the client report to show categories instead of the BOM is not yet planned — overlaps with #91.
- _Item 66 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — An editable management-fee field in the calculator is not yet built.
- _Item 61 · 2026-04-23 · https://konti-demo.replit.app/team_ — Uploading new people (contractor directory, not platform users) is not yet built.
- _Item 58 · 2026-04-23 · https://konti-demo.replit.app/calculator_ — Copy clarification ('what is effective?') has not been addressed.
- _Item 57 · 2026-04-23 · https://konti-demo.replit.app/calculator_ — Auto-populating all materials from import (vs. selecting one-by-one) is not yet planned — overlaps with #82.
- _Item 56 · 2026-04-23 · https://konti-demo.replit.app/calculator_ — Surfacing design / permits / taxes / gov-fees lines in the calculator summary is not yet planned.
- _Item 55 · 2026-04-23 · https://konti-demo.replit.app/calculator_ — Renaming/restructuring 'Contractor calculator' inputs into a 'Project information' panel is not yet planned.
- _Item 53 · 2026-04-23 · https://konti-demo.replit.app/calculator_ — CSV import was shipped (#22) but the column mapping does not match the team's estimating template; alignment is still pending.
- _Item 52 · 2026-04-23 · https://konti-demo.replit.app/materials_ — Lump-sum labor model (vs. hourly) is a calculator data-model change and not yet planned.
- _Item 49 · 2026-04-23 · https://konti-demo.replit.app/calculator?projectId=proj-1&tab=variance_ — Lifting the receipts/categorization workflow into the dashboard so it's discoverable is not yet planned.
- _Item 20 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Client profile fields (phone, postal/physical addresses) are not yet editable in settings.
- _Item 15 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Task #7, Task #11, Task #25 — Weather (#7), change orders (#11) and punchlist (#25) shipped, but a single consolidated 'contractor monitoring' report is not yet planned — surfacing for triage.
- _Item 14 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Photos & comments section is not yet built — see #3, #22, #68.
- _Item 12 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Copy change ('Cronograma del proyecto') has not been applied yet.
- _Item 2 · 2026-04-15 · https://konti-demo.replit.app/materials_ — No 'Add material' button on the materials library yet — page is read-only catalog today.

### Feature request (Solicitud de funcionalidad) (8)

- _Item 59 · 2026-04-23 · https://konti-demo.replit.app/calculator_ — Editable base price and quantity in the calculator are not yet exposed in the UI.
- _Item 19 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Per-invoice columns (total, paid, balance, status) are not yet on the client view.
- _Item 17 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — A 'Gastos no facturables' tab is not yet built.
- _Item 16 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Client-side document upload is not yet built; today only the team uploads.
- _Item 11 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — A separate 'Contratos y Acuerdos de compra' grouping is not yet built; documents are flat today.
- _Item 7 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — A client action log (audit trail) is not yet planned.
- _Item 5 · 2026-04-15 · https://konti-demo.replit.app/dashboard_ — Activity items in the dashboard feed are not yet click-through to detail.
- _Item 4 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — A photos/videos & comments section inside the project is not yet built — see also items #13, #22, #68.

### Other (Otro) (5)

- _Item 76 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1776983841174_ — Document/note 'private' visibility needs to default to team-only and never show to clients — overlaps with #26.
- _Item 35 · 2026-04-15 · https://konti-demo.replit.app/materials_ — Task #28 — Auto-updating labor rates from receipts is not yet built; real OCR for receipts is scheduled in #28 and is a prerequisite.
- _Item 27 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Per-document client-visibility flag is not yet built.
- _Item 26 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Document version history (with download of latest) is not yet built.
- _Item 23 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Self-administration and image upload by client are not yet built — overlaps with #3, #13, #15, #68.

### Design (Diseño) (4)

- _Item 98 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Switching the report from black to the KONTi palette is not yet planned — see also #2, #17.
- _Item 97 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Logo size on the report has not been increased yet.
- _Item 18 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — A KONTi-branded gray (vs. the current dark) is not yet applied — related to #2 and #97.
- _Item 3 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1/report_ — Light mode for the report page is not on the roadmap yet — see also items #17 and #97.

### Bug report (Reporte de bug) (1)

- _Item 82 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1776983841174_ — Task #27, Task #30, Task #32 — Upload not persisting is a known limitation of the demo's in-memory data; persistence is scheduled in #27, #30, #32.

---

<a id="inprogress-appendix"></a>

## In Progress / Scheduled (En progreso / programado)

Each item in this section cites at least one open project task that covers the remaining work. Items where one slice has shipped but a follow-up task is still scheduled are conservatively classified here.

Cada ítem en esta sección cita al menos una tarea de proyecto abierta que cubre el trabajo restante. Cuando una parte fue entregada pero otra parte aún está programada, los clasificamos aquí de forma conservadora.

### Other (Otro) (3)

- _Item 43 · 2026-04-15 · https://konti-demo.replit.app/ai_ — Task #25, Task #32 — Punchlist as a phase-advance gate shipped (#25); punchlist persistence across server restarts is scheduled (#32).
- _Item 40 · 2026-04-15 · https://konti-demo.replit.app/ai_ — Task #23, Task #30 — Notes-from-client-questions UI shipped (#23); persistence across server restarts is scheduled (#30).
- _Item 34 · 2026-04-15 · https://konti-demo.replit.app/calculator_ — Task #22, Task #29 — Report-template upload shipped in #22; using that template when exporting the project PDF is scheduled in #29.

### Design (Diseño) (1)

- _Item 8 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-2/report_ — Task #4, Task #29 — PDF export shipped (#4); using the saved template when exporting and keeping a side history of generated reports is scheduled in #29.

### Feature request (Solicitud de funcionalidad) (1)

- _Item 21 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Task #22, Task #27 — KONTi-side receipt entry shipped (#22); persistence across server restarts is scheduled (#27).

### Contenido / Copy (Content) (1)

- _Item 48 · 2026-04-23 · https://konti-demo.replit.app/dashboard_ — Task #18 — Showing only the construction-status card on the client home is scheduled in #18; the broader 'move overall stats into per-project' restructure is still pending.

---

<a id="oos-appendix"></a>

## Out of scope / needs discussion (Fuera de alcance / requiere conversación)

These items are strategic, philosophical, or product-direction feedback that warrant a conversation rather than a single task. Listed by topic, then date.

Estos ítems son feedback estratégico, filosófico o de dirección de producto que requieren una conversación más que una sola tarea. Listados por tema y luego por fecha.

### Contenido / Copy (Content) (19)

- _Item 90 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Clarification on whether this section is client instructions — needs a walkthrough.
- _Item 86 · 2026-04-23 · https://konti-demo.replit.app/permits_ — Clarification on final-document distribution (Drive sync, client download) — needs scoping.
- _Item 85 · 2026-04-23 · https://konti-demo.replit.app/permits_ — Clarification on permit-doc upload and signature flow — needs a walkthrough.
- _Item 83 · 2026-04-23 · https://konti-demo.replit.app/calculator?projectId=proj-1776983841174&tab=variance_ — Workflow clarification on whether each estimate selects materials individually — needs a product call. Overlaps with #56, #59.
- _Item 81 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1776983841174_ — Auto-emailing clients for signature requests is a notification/email integration; needs scoping.
- _Item 78 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1776983841174_ — Clarification on the special punchlist items field — needs a walkthrough.
- _Item 77 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1776983841174_ — Clarification on what the zoning/project-type calculator computes — needs a walkthrough.
- _Item 75 · 2026-04-23 · https://konti-demo.replit.app/leads_ — Asana template-driven project creation — third-party integration question, needs scoping.
- _Item 73 · 2026-04-23 · https://konti-demo.replit.app/leads_ — Clarification about the leads page being a CRM vs. Asana mirror — needs a walkthrough.
- _Item 71 · 2026-04-23 · https://konti-demo.replit.app/ai_ — Clarification on how info flows back to the client — needs a walkthrough.
- _Item 68 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Clarification: is this page the punchlist? — needs a walkthrough.
- _Item 65 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Clarification about category sources — needs a walkthrough.
- _Item 64 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Clarification: client view vs. KONTi view — needs a walkthrough; report has both modes today.
- _Item 60 · 2026-04-23 · https://konti-demo.replit.app/calculator_ — 'One master calculator that each project copies' is a workflow design that needs a product call before building.
- _Item 54 · 2026-04-23 · https://konti-demo.replit.app/calculator_ — Workflow clarification about who maintains the template — needs a product call.
- _Item 51 · 2026-04-23 · https://konti-demo.replit.app/calculator?projectId=proj-1&tab=variance_ — Same clarification request — needs a walkthrough.
- _Item 50 · 2026-04-23 · https://konti-demo.replit.app/calculator?projectId=proj-1&tab=variance_ — Clarification request about the variance tab — needs a walkthrough rather than code.
- _Item 22 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Workflow expectation ('update once a week') — process note, not a product change.
- _Item 13 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Parallel phases would change the validator-driven 9-phase model from #11; needs a product call before building.

### Other (Otro) (7)

- _Item 96 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1/report_ — Asana sync question for the report — same theme as #23, #61, #74.
- _Item 84 · 2026-04-23 · https://konti-demo.replit.app/permits_ — Drive integration question — needs scoping.
- _Item 72 · 2026-04-23 · https://konti-demo.replit.app/ai_ — Clarification on whether the AI is the channel for change orders / specs — needs a product call.
- _Item 63 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1_ — Clarification request — needs a walkthrough.
- _Item 62 · 2026-04-23 · https://konti-demo.replit.app/projects/proj-1_ — Asana connection question — see #23, #74, #95.
- _Item 47 · 2026-04-15 · https://konti-demo.replit.app/dashboard_ — Process item (record a demo video) — not a product change.
- _Item 24 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Bidirectional Asana sync is a third-party integration; needs scoping before building.

### Feature request (Solicitud de funcionalidad) (2)

- _Item 70 · 2026-04-23 · https://konti-demo.replit.app/ai_ — Scope clarification on what the AI should do (KONTi vs. on-site reports) — needs a product call.
- _Item 25 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Google Drive as the canonical store is a third-party integration; needs scoping.

---

<a id="completed-appendix"></a>

## Completed (Completado)

These items are linked to a merged project task or a verifiable commit on `main`. Items where any portion of the request is still scheduled are tracked under In Progress, not here.

Estos ítems están vinculados a una tarea de proyecto fusionada o a un commit verificable en `main`. Los ítems con cualquier parte aún programada se rastrean bajo En Progreso, no aquí.

### Design (Diseño) (8)

- _Item 44 · 2026-04-15 · https://konti-demo.replit.app/ai_ — Task #26, Task #36 — Notification button visibility was fixed in #26 and the sidebar/header was polished in #36.
- _Item 37 · 2026-04-15 · https://konti-demo.replit.app/team_ — Task #35 (commit `9de748f`) — Team member entry was removed during the team-page edits.
- _Item 36 · 2026-04-15 · https://konti-demo.replit.app/team_ — Task #35 (commit `9de748f`) — Team member name updated to Nainoshka in seed data and AI knowledge base.
- _Item 30 · 2026-04-15 · https://konti-demo.replit.app/calculator_ — Task #22 — Editable categories with Excel/CSV import shipped in the calculator overhaul (#22).
- _Item 29 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-1_ — Task #24 — Client notes/queries panel beside the chat shipped as part of #24.
- _Item 28 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-3_ — Task #24, Task #26 — Client-side notifications popup shipped in #24; the bell button was polished in #26.
- _Item 10 · 2026-04-15 · https://konti-demo.replit.app/calculator_ — Task #3 — Language toggle (EN/ES) was wired across the app, including the calculator copy.
- _Item 1 · 2026-04-15 · https://konti-demo.replit.app/dashboard_ — Task #5, Task #8, Task #36 — Login logo and sidebar logo were corrected and the menatech footer added.

### Other (Otro) (6)

- _Item 45 · 2026-04-15 · https://konti-demo.replit.app/ai_ — Task #23 — Confirm-before-classify shipped in the AI UX upgrade #23.
- _Item 42 · 2026-04-15 · https://konti-demo.replit.app/ai_ — Task #23 — Voice notes integration shipped in #23.
- _Item 41 · 2026-04-15 · https://konti-demo.replit.app/ai_ — Task #23 — Spec-updates report shipped in #23.
- _Item 39 · 2026-04-15 · https://konti-demo.replit.app/ai_ — Task #23 — Markdown rendering for the AI assistant shipped in #23.
- _Item 33 · 2026-04-15 · https://konti-demo.replit.app/calculator_ — Task #22 — Variance reports (estimated vs. spent) shipped in #22.
- _Item 32 · 2026-04-15 · https://konti-demo.replit.app/calculator_ — Task #22 — Contractor estimate calculator shipped in #22.

### Feature request (Solicitud de funcionalidad) (4)

- _Item 38 · 2026-04-15 · https://konti-demo.replit.app/permits_ — Task #26 — Permits 'Diseño' section was added in the polish bundle (#26).
- _Item 31 · 2026-04-15 · https://konti-demo.replit.app/calculator_ — Task #22 — Labor rates with CSV import shipped in #22.
- _Item 9 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-2_ — Task #11 — The 9-phase validator-driven rework broke each phase into visible sub-steps with status, dates and gates.
- _Item 6 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-2_ — Task #7 — Documents panel was made richer and clickable as part of weather + documents work.

### Bug report (Reporte de bug) (1)

- _Item 46 · 2026-04-15 · https://konti-demo.replit.app/projects/proj-2_ — Task #21 — Project creation save bug fixed in #21.

---


<a id="evidence-index"></a>

## Evidence Index (Índice de evidencia)

A compact mapping from each Completed and In-Progress item to its supporting project task(s) and / or commit, for fast client audit.

Mapeo compacto de cada ítem Completado y En progreso a la(s) tarea(s) de proyecto y / o commit que lo respaldan, para auditoría rápida del cliente.

| # | Date (Fecha) | Page (Página) | Status (Estado) | Refs | Task title (Título de la tarea) |
|---:|---|---|---|---|---|
| 1 | 2026-04-15 | https://konti-demo.replit.app/dashboard | ✅ Completed | #5, #8, #36 | Login logo fix + Perplexity material pricing · Menatech branding + login logo polish · Sidebar polish: notifications panel on-screen, bigger KONTi logo, smaller menatech footer |
| 6 | 2026-04-15 | https://konti-demo.replit.app/projects/proj-2 | ✅ Completed | #7 | Weather history chart + richer documents |
| 8 | 2026-04-15 | https://konti-demo.replit.app/projects/proj-2/report | 🟡 In progress | #4, #29 | PDF export button on report page + OpenAI fallback for AI assistant · Use the saved report template when exporting project PDFs |
| 9 | 2026-04-15 | https://konti-demo.replit.app/projects/proj-2 | ✅ Completed | #11 | Phase 3 — Design sub-phases & Change Orders |
| 10 | 2026-04-15 | https://konti-demo.replit.app/calculator | ✅ Completed | #3 | UX Polish: language toggle in top nav, client portal view, mobile responsiveness |
| 21 | 2026-04-15 | https://konti-demo.replit.app/projects/proj-1 | 🟡 In progress | #22, #27 | Estimating calculator overhaul (Excel + receipts + variance reports) · Persist receipts and contractor estimates so they survive a server restart |
| 28 | 2026-04-15 | https://konti-demo.replit.app/projects/proj-3 | ✅ Completed | #24, #26 | Client view: notes/queries panel + notifications popup · Polish bundle: permits Design section, team page edits, notifications button fix |
| 29 | 2026-04-15 | https://konti-demo.replit.app/projects/proj-1 | ✅ Completed | #24 | Client view: notes/queries panel + notifications popup |
| 30 | 2026-04-15 | https://konti-demo.replit.app/calculator | ✅ Completed | #22 | Estimating calculator overhaul (Excel + receipts + variance reports) |
| 31 | 2026-04-15 | https://konti-demo.replit.app/calculator | ✅ Completed | #22 | Estimating calculator overhaul (Excel + receipts + variance reports) |
| 32 | 2026-04-15 | https://konti-demo.replit.app/calculator | ✅ Completed | #22 | Estimating calculator overhaul (Excel + receipts + variance reports) |
| 33 | 2026-04-15 | https://konti-demo.replit.app/calculator | ✅ Completed | #22 | Estimating calculator overhaul (Excel + receipts + variance reports) |
| 34 | 2026-04-15 | https://konti-demo.replit.app/calculator | 🟡 In progress | #22, #29 | Estimating calculator overhaul (Excel + receipts + variance reports) · Use the saved report template when exporting project PDFs |
| 36 | 2026-04-15 | https://konti-demo.replit.app/team | ✅ Completed | #35 / `9de748f` | Update old team-member names in project history and AI knowledge base |
| 37 | 2026-04-15 | https://konti-demo.replit.app/team | ✅ Completed | #35 / `9de748f` | Update old team-member names in project history and AI knowledge base |
| 38 | 2026-04-15 | https://konti-demo.replit.app/permits | ✅ Completed | #26 | Polish bundle: permits Design section, team page edits, notifications button fix |
| 39 | 2026-04-15 | https://konti-demo.replit.app/ai | ✅ Completed | #23 | AI assistant UX upgrade (markdown, voice, confirm-before-classify, client questions, spec report) |
| 40 | 2026-04-15 | https://konti-demo.replit.app/ai | 🟡 In progress | #23, #30 | AI assistant UX upgrade (markdown, voice, confirm-before-classify, client questions, spec report) · Save AI assistant notes and updates so they survive restarts |
| 41 | 2026-04-15 | https://konti-demo.replit.app/ai | ✅ Completed | #23 | AI assistant UX upgrade (markdown, voice, confirm-before-classify, client questions, spec report) |
| 42 | 2026-04-15 | https://konti-demo.replit.app/ai | ✅ Completed | #23 | AI assistant UX upgrade (markdown, voice, confirm-before-classify, client questions, spec report) |
| 43 | 2026-04-15 | https://konti-demo.replit.app/ai | 🟡 In progress | #25, #32 | Punchlist as phase advancement gate · Persist punchlist edits so they survive a server restart |
| 44 | 2026-04-15 | https://konti-demo.replit.app/ai | ✅ Completed | #26, #36 | Polish bundle: permits Design section, team page edits, notifications button fix · Sidebar polish: notifications panel on-screen, bigger KONTi logo, smaller menatech footer |
| 45 | 2026-04-15 | https://konti-demo.replit.app/ai | ✅ Completed | #23 | AI assistant UX upgrade (markdown, voice, confirm-before-classify, client questions, spec report) |
| 46 | 2026-04-15 | https://konti-demo.replit.app/projects/proj-2 | ✅ Completed | #21 | Fix project creation save bug |
| 48 | 2026-04-23 | https://konti-demo.replit.app/dashboard | 🟡 In progress | #18 | Show the construction status card on the client home for a more focused view |

---

<a id="methodology-note"></a>

## Methodology Note (Nota de metodología)

**Sources (Fuentes):**

1. **In-app feedback inbox** — All 98 items pulled from the in-app inbox via the agent inbox API. Items are filtered by (status, topic) pairs; two PENDING buckets exceeded the 20-item cap (CONTENT=47, OTHER=21) and were drained by temporarily flipping visible items to ACKNOWLEDGED, refetching, then restoring all 68 to PENDING. Final inbox state matches the original (98 PENDING).
2. **Project task board** — All 45 project tasks across every state (refs #1 through #45) were enumerated and matched to feedback items by topic + content + date. Project tasks live inside the Replit workspace and do not have public URLs to link to from this report; the team can open each ref in the workspace task panel.
3. **Git history** — `git log --all --oneline` was scanned for commits that explicitly cite a Task # (e.g. `Update old team-member names ... (Task #35)` → commit `9de748f`). The repository has no public mirror, so commit hashes are shown but not hyperlinked.

**Status definitions (Definiciones de estado):**

- **Completed (Completado):** The full request is linked to a merged project task or a verifiable commit on `main`. Items where any portion of the request is still scheduled fall into **In progress** instead.
- **In progress / scheduled (En progreso / programado):** Cites at least one open project task (state PENDING / IN_PROGRESS / PROPOSED) that covers the remaining work. Items where part of the request shipped and a follow-up is still scheduled are conservatively placed here, with the open task explicitly cited.
- **Pending (Pendiente):** Open feedback that is not yet linked to a project task — surfaced for the team to triage.
- **Out of scope / needs discussion (Fuera de alcance / requiere conversación):** Strategic, philosophical, or product-direction feedback that warrants a conversation rather than a single task.

**Coverage check (Verificación de cobertura):** Every one of the 98 inbox items is labeled with exactly one of the four statuses. Status totals: 19 Completed + 6 In progress + 45 Pending + 28 Out of scope = 98.

**Screenshots (Capturas):** The in-app inbox stores screenshots as private object-store keys (e.g. `<replId>/<timestamp>_<hash>.png`). The links in this report point to the matching item inside the in-app inbox UI, where the team can open each screenshot. The asset key is included in backticks for traceability.

**Verbatim quotes (Citas textuales):** Feedback text is reproduced exactly as submitted — Spanish remains Spanish, English remains English, and team typos / shorthand are preserved.

**Inbox state (Estado del buzón):** All 98 inbox items were already in PENDING state at the start of this exercise (no items were in ACKNOWLEDGED, DISMISSED, IMPLEMENTED, or DELETED). To work around the inbox API's 20-item-per-bucket cap, 68 items were temporarily flipped to ACKNOWLEDGED so that the next page could be fetched, and were then restored to PENDING. After this exercise, the inbox state is identical to the starting state: 98 PENDING items, 0 in any other status.

