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

## Identidad visual definitiva

**Estado:** implementación y validación automatizada completadas; QA visual/manual de accesos
directos pendiente.

Logo oficial en acceso y sidebar, e icono multirresolución para ventana, ejecutable, instalador,
desinstalador y accesos directos. Se conserva la paleta turquesa y no se modifican funciones, datos,
rutas ni contratos.

## Preparación de versión 1.0.0

**Estado:** código validado para cierre; actualización real 0.9.0 → 1.0.0 aprobada.

Se conserva `appId`, la carpeta histórica `optica-desktop`, las seis migraciones y el formato de
backup. El instalador 1.0.0 se validó con el runtime empaquetado y se actualizó sobre 0.9.0 en la
cuenta aislada `OcchialiQA`, sin pérdida de información o credenciales. No existe actualizador
automático; el commit, tag y publicación se realizan manualmente.

Las mejoras de respaldos automáticos, alertas globales e historial de operaciones se reservan para
1.1.0. La versión 1.0.0 conserva la generación manual/asistida y la exportación opcional a una
carpeta sincronizada.

## 1.1.0 — Bloque 1: alertas e historial de respaldos

**Estado:** implementación y pruebas automatizadas completadas; QA manual pendiente.

Estado real del último respaldo, cálculo por horario local, avisos globales a las 24 y 72 horas,
detección de archivos locales o externos ausentes e historial atómico limitado a 90 eventos. No
incluye scheduler, credenciales persistidas ni integración directa con servicios de nube.

## 1.1.0 — Bloque 2: respaldos automáticos

**Estado:** implementación y validación técnica automatizada completadas; QA manual de Windows
pendiente.

Scheduler activo sólo mientras Occhiali permanece abierto, credencial protegida mediante
`safeStorage`, recuperación de ventanas pendientes, reanudación después de suspensión, exclusión
mutua con restauraciones e historial diferenciado. No incorpora servicios externos ni retención
avanzada de copias externas.

## 1.1.0 — Bloque 3: copias externas y retención segura

**Estado:** implementación y validación automatizada completadas; QA manual de Windows pendiente.

Publicación externa mediante temporal exclusivo con comprobación de tamaño y SHA-256, reintentos
persistentes y acotados sobre el mismo respaldo local, estados diferenciados e historial real. La
retención local sólo elimina respaldos propios reconocidos, omite enlaces y archivos ambiguos,
protege copias en uso y nunca aplica borrado automático al destino externo.

## 1.1.0 — Bloque 4: recuperación ante desastres y compatibilidad

**Estado:** implementación y validación automatizada completadas; QA manual de Windows pendiente.

Compatibilidad demostrada con fixtures cifrados controlados de 0.9.0 y 1.0.0, restauración en un
perfil nuevo sin DPAPI, cobertura integral de datos comerciales, rechazo conservador de archivos
incorrectos o truncados y exclusión mutua con scheduler y reintentos. La interfaz advierte la fecha
del respaldo y la pérdida de cambios posteriores antes de confirmar.
