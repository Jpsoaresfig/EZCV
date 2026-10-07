# 07 — Proveedores que pueden recibir datos personales

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA.** Analizado **por flujo de datos**. «El proveedor es GDPR compliant» **no** es un análisis. Los campos marcados `TODO` requieren comprobación por el titular en los paneles/contratos de cada proveedor.

## Inventario (verificado en el código y la configuración)

| Proveedor | Uso en Fíchame | Datos | ¿Candidatos? |
|---|---|---|---|
| **Supabase, Inc.** | PostgreSQL (todas las tablas) y Storage (CV, logos) | Todos los datos de la plataforma | **Sí — todo, incluidos CV** |
| **Vercel Inc.** | Ejecución de la app Express (funciones) y CDN | Tránsito de todas las peticiones; logs de peticiones (rutas, IP) | **Sí — en tránsito** (formularios, descargas de CV) y logs |
| Proveedor **SMTP** | Emails de aviso y recuperación | Email del negocio; enlace al panel | No (el email no contiene datos del candidato) — **no configurado** en el entorno auditado |
| Meta (WhatsApp) | Enlace `wa.me` en la ficha | Teléfono del candidato si el negocio pulsa el enlace | **Decisión del negocio**; no es subencargado de Fíchame |
| CDN de terceros, analítica, CAPTCHA, IA, observabilidad | **Ninguno** (la CSP bloquea dominios externos) | — | — |

## Fichas por proveedor

### Supabase, Inc. (EE. UU.)
- **Región del proyecto**: `TODO: REQUIRES COMPANY INPUT` (Project Settings → General → Region). Recomendación: región UE (p. ej., Fráncfort `eu-central-1` o Irlanda `eu-west-1`).
- **DPA**: `TODO` — Supabase ofrece un DPA; confirmar aceptación/firma y versión.
- **Transferencia**: aunque los datos estén en la UE, el acceso de soporte/ingeniería desde EE. UU. u otros países puede constituir transferencia. Verificar: certificación en el **EU-U.S. Data Privacy Framework** (lista oficial dataprivacyframework.gov) y/o **SCC** (Decisión 2021/914) en el DPA; evaluación de impacto de transferencia si se usan SCC.
- **Subencargados**: `TODO` — lista publicada por Supabase (incluye proveedor cloud subyacente).
- **Copias de seguridad / PITR**: `TODO` — plan y retención (afecta a la supresión, ver [06](06-data-subject-rights.md)).
- **Medidas complementarias implementadas**: bucket privado, sin URLs públicas ni firmadas, RLS deny-all para anon/authenticated, `service_role` solo en el servidor.

### Vercel Inc. (EE. UU.)
- **Región de funciones**: `TODO`. Sin `vercel.json`, Vercel ejecuta por defecto en una región de EE. UU. (*verificar en Settings → Functions*). **PROBLEMA ENCONTRADO (potencial)**: si las funciones se ejecutan en EE. UU., cada candidatura y cada descarga de CV **transita y se procesa en EE. UU.** Recomendación: fijar región UE (p. ej., `fra1`/`cdg1`) igual a la de Supabase.
- **DPA / DPF / SCC / subencargados / retención de logs de peticiones**: `TODO`.
- Los **logs de peticiones** de Vercel incluyen rutas e IP; las rutas de Fíchame no contienen datos personales salvo ids internos (el token de recuperación de contraseña va en el fragmento `#`, que no llega al servidor).

### Proveedor SMTP
- `TODO: REQUIRES COMPANY INPUT` — elegir proveedor con DPA y servidores en la UE. Contenido mínimo ya aplicado.

## Decisión de adecuación UE-EE. UU.

Decisión de Ejecución (UE) 2023/1795 de la Comisión (EU-U.S. Data Privacy Framework), de 10-7-2023: solo cubre a empresas **certificadas** y para los datos incluidos en su certificación. *Verificar vigencia en la fecha de lanzamiento* (ha sido objeto de impugnaciones).

## Acción antes de producción (BLOCKER / LEGAL REVIEW REQUIRED)

1. Confirmar regiones UE de Supabase y Vercel.
2. Aceptar/firmar DPA de cada proveedor y archivar copia.
3. Documentar mecanismo de transferencia por proveedor.
4. Publicar la lista de subencargados en `/privacidad#subencargados` con datos reales (hoy hay marcadores).
