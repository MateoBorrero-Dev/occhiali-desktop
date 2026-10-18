# Roadmap

## Fase 1 — Inicialización y arquitectura

**Estado:** completada.

Base Electron/React/TypeScript, seguridad, tooling, pantalla inicial y documentación.

## Fase 2 — SQLite, esquema y migraciones

**Estado:** completada.

Motor SQLite, conexión local, esquema inicial, migraciones reales y estrategia de integridad.

## Fase 3 — Diseño de interfaz y navegación

**Estado:** completada.

Identidad OCCHIALI, layout de escritorio, navegación local, componentes reutilizables, estados
vacíos y patrones accesibles validados en Electron.

## Fase 4 — Gestión de clientes

**Estado:** completada y aprobada.

Alta, edición, búsqueda, consulta, archivado y reactivación de clientes con SQLite e IPC seguro.

## Fase 5 — Historial de recetas ópticas

**Estado:** implementación y pruebas automatizadas completadas; QA visual manual pendiente.

Registro y consulta de múltiples recetas por cliente, búsqueda y filtros, graduaciones FAR/NEAR y
OD/OI, correcciones con ID estable y revisiones históricas transaccionales.

## Fase 6 — Fichas completas de trabajo

**Estado:** implementación y pruebas automatizadas completadas; QA visual manual pendiente.

Productos, armazones, receta opcional, tratamientos y acabados de lentes, coloración, observaciones,
búsqueda, edición e historial por cliente.

## Fase 7 — Búsquedas y consultas

**Estado:** implementación y pruebas automatizadas completadas; QA visual manual pendiente.

Dashboard con conteos SQLite, búsqueda global agrupada, navegación relacionada, filtros coherentes y
selector incremental de recetas.

## Fase 8 — Seguridad, backups y restauración

**Estado:** implementación y pruebas automatizadas completadas; QA visual manual pendiente.

Protección local con autorización en Main, backups SQLite cifrados y verificables, exportación a
carpeta sincronizada, restauración segura y disaster recovery independiente.

## Fase 9 — QA e instalador Windows

**Estado:** implementación y distribución completadas; QA visual/manual completo pendiente.

Instalador NSIS x64 0.9.0, identidad estable, `userData` preservado, SQLite nativo empaquetado,
inspección de ASAR, instalación y reinstalación controlada. Una actualización real entre versiones
distintas y el recorrido visual del instalador/aplicación quedan pendientes.

## Fase 10 — Preparación para ampliaciones

**Estado:** auditoría, estabilización y pruebas automatizadas completadas; QA visual manual pendiente.

Auditoría integral sin cambios comerciales, selección escalable de clientes en recetas, regresiones
de UX, ensayo temporal con 1.000 clientes, backup/restauración y documentación para usuaria, entrega
y soporte. Los cambios solicitados por la dueña se incorporarán después y todavía no se consideran
implementados. La versión permanece en 0.9.0 y no constituye una entrega definitiva.

## Ajustes de la clienta — Bloque 2

**Estado:** implementación y pruebas automatizadas completadas; QA visual manual pendiente.

Adición opcional e independiente para OD/OI, trazabilidad en revisiones y rediseño de graduaciones
con paneles Lejos/Cerca. La migración incremental conserva recetas y revisiones anteriores sin
inferencias ni cálculos clínicos.

## Ajustes de la clienta — Bloque 3

**Estado:** implementación y pruebas automatizadas completadas; QA visual manual pendiente.

Registro de entrega por titular o tercero, snapshot histórico, numeración única, bloqueo de
duplicados, vista A4, PDF local y trazabilidad append-only. No incorpora facturación, ventas,
cobros, stock, firma digital ni entregas parciales. La versión permanece en 0.9.0.
