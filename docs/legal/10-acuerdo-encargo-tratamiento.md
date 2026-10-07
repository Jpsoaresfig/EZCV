# 10 — Acuerdo de encargo del tratamiento: estructura y cláusulas abiertas

> **BORRADOR — REQUIERE REVISIÓN JURÍDICA ANTES DE USO COMERCIAL.** El texto mostrado a los negocios está en `/encargo` (`src/views/legal/dpa.ejs`, versión `DPA_VERSION` en `src/lib/legal.js`). Se acepta en el registro; se guardan `dpa_version` y `terms_accepted_at` en `restaurants`.

| Contenido exigido (art. 28.3 RGPD) | Estado en `/encargo` |
|---|---|
| Objeto, duración, naturaleza y finalidad | Redactado (cl. 1-2) |
| Tipo de datos y categorías de interesados | Redactado (cl. 3) |
| Obligaciones y derechos del responsable | Parcial |
| a) Instrucciones documentadas (incl. transferencias) | Redactado (cl. 4); falta mención expresa a transferencias |
| b) Confidencialidad del personal | Redactado (cl. 5) |
| c) Medidas del art. 32 | Resumen (cl. 6); anexo técnico pendiente |
| d) Subencargados (autorización general + aviso de cambios) | Redactado (cl. 7); **plazo de oposición pendiente** |
| e) Asistencia en derechos | Redactado (cl. 8) y **implementado** (canal y herramientas) |
| f) Asistencia en arts. 32-36 (seguridad, brechas, EIPD, consulta previa) | Cl. 9-10; **plazo de notificación de brechas pendiente** |
| g) Supresión o devolución al final | Cl. 11; **plazo de exportación pendiente**; herramienta `npm run delete-account` |
| h) Información y auditorías | Cl. 10; **condiciones pendientes** |
| Responsabilidad, ley aplicable, jurisdicción | **Pendiente** |

**Versionado:** al cambiar el texto, incrementar `DPA_VERSION`; los negocios ya registrados mantienen la versión aceptada registrada. *Pendiente*: flujo para pedir la aceptación de una versión nueva.
