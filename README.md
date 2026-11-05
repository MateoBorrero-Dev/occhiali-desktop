# Sistema de Gestión Óptica

Aplicación de escritorio offline para digitalizar la gestión cotidiana de una óptica pequeña de
Argentina. Dispone de una base técnica y de persistencia, además de una interfaz de escritorio con
navegación y módulos de clientes, fichas ópticas unificadas y retiros conectados al almacenamiento
local.

## Tecnologías

- Electron y electron-vite.
- React con TypeScript estricto.
- Vite y Tailwind CSS.
- React Router para navegación local compatible con la aplicación empaquetada.
- Lucide React para iconografía accesible y consistente.
- Vitest para pruebas automatizadas.
- ESLint y Prettier para calidad y formato.
- SQLite mediante `better-sqlite3`, con almacenamiento bajo `app.getPath('userData')`.
- electron-builder y NSIS para el instalador Windows x64.
- Identidad visual oficial desde `resources/branding`, con logo adaptado al contraste e icono
  multirresolución para Windows.

Las versiones exactas instaladas están fijadas en `package.json` y `package-lock.json`.

## Requisitos de desarrollo

- Node.js 22.12 o posterior. Se recomienda una versión LTS compatible.
- npm 10 o posterior.
- Windows 10 u 11 para el entorno objetivo.

## Instalación

```bash
npm ci --ignore-scripts
```

La instalación reproducible usa el lockfile y no ejecuta hooks de dependencias. `better-sqlite3`
incluye el prebuild Windows x64 que luego se valida tanto bajo Electron como dentro del paquete;
no se requiere compilarlo con `node-gyp`.

## Desarrollo

```bash
npm run dev
```

El comando inicia Vite, compila los procesos main/preload y abre una única ventana de Electron con
recarga durante el desarrollo.

## Validaciones

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:electron
npm run build
npm run package
npm run verify
```

Para aplicar el formato configurado:

```bash
npm run format
```

## Estado

**Fase 1 — Inicialización y arquitectura:** completada.

**Fase 2 — SQLite, modelo de datos y persistencia:** completada.

**Fase 3 — Diseño de interfaz y navegación:** completada.

**Fase 4 — Gestión de clientes:** completada y aprobada.

**Fase 5 — Historial de recetas ópticas:** implementación y validación automatizada completadas; QA
visual manual pendiente.

**Fase 6 — Gestión de pedidos y fichas ópticas:** implementación y validación automatizada
completadas; QA visual manual pendiente.

**Fase 7 — Consultas avanzadas, dashboard y optimización UX:** implementación y validación
automatizada completadas; QA visual manual pendiente.

**Fase 8 — Seguridad, backups y restauración:** protección local, backup cifrado verificable,
exportación a carpeta sincronizada y disaster recovery implementados; QA visual manual pendiente.

**Fase 9 — Instalador Windows:** instalador NSIS x64 0.9.0, persistencia fuera de la instalación y
validación real del runtime empaquetado implementados; QA visual/manual completo pendiente.

**Fase 10 — Auditoría integral y estabilización:** defectos comprobables corregidos, prueba integral
con 1.000 clientes, backup/restauración y documentación operativa incorporados; QA visual manual
pendiente en ese hito, previo a la preparación final de 1.0.0.

**Ajustes de la clienta — Bloque 1:** fichas con tratamientos libres, color del producto, proveedor
opcional y “Lentes de contacto” como sugerencia de producto; QA visual manual pendiente.

**Ajustes de la clienta — Bloque 2:** adición independiente por ojo y paneles profesionales de
graduación Lejos/Cerca implementados con historial compatible; QA visual manual pendiente.

**Ajustes de la clienta — Bloque 3:** comprobantes históricos de retiro por titular o tercero,
numeración transaccional, prevención de duplicados, aclaraciones/anulaciones y exportación PDF local
implementados; QA visual manual pendiente.

**Identidad visual definitiva:** logo oficial incorporado al acceso y al menú lateral; icono
multirresolución aplicado al ejecutable, ventana e instalador NSIS, sin cambios funcionales ni de
datos.

**Versión 1.0.0:** código, metadatos, instalador y documentación validados para su cierre. La suite
automatizada aprueba 260 pruebas y la actualización real 0.9.0 → 1.0.0 fue comprobada en la cuenta
aislada de Windows `OcchialiQA`, conservando datos, credenciales, PDF, persistencia y restauración de
un backup anterior. El commit, tag, push y publicación continúan siendo pasos manuales separados.

**Versión 1.1.0:** cuatro bloques de mejoras de respaldos completados: observabilidad, automatización
con DPAPI, transferencias y retención conservadora y recuperación ante desastres. El candidato se
genera en un destino aislado y conserva identidad, perfil y migraciones de 1.0.0.

**Versión 1.2.0:** preparación previa al instalador. Unifica receta, graduación y trabajo en Fichas
ópticas; incorpora cristal y marca, edición transaccional, una sección independiente de Retiros y el
envío asistido de comprobantes digitales por WhatsApp. Mantiene `appId`, carpeta de datos e
identificadores históricos. El instalador candidato todavía no se generó.

La usuaria final solo necesita Windows 10 u 11 x64 y el instalador generado. No necesita Node.js,
npm, Git ni herramientas de desarrollo. La instalación y sus limitaciones están documentadas en
[Instalador Windows](docs/windows-installer.md).

La aplicación permite gestionar clientes y crear, buscar, consultar y editar Fichas ópticas desde
una experiencia unificada. La graduación LEJOS/CERCA para OD/OI conserva revisiones históricas; los
datos comerciales incluyen producto, cristal, marca, color, coloración, tratamientos y armazón. Los
valores ADD anteriores se preservan en SQLite, aunque ya no forman parte de la interfaz. Las altas y
ediciones conjuntas son transaccionales y usan canales IPC específicos y validados; no se usan datos
simulados ni `localStorage`.

Retiros dispone de listado, filtros, detalle, aclaraciones, anulaciones y comprobante digital PDF.
El flujo de WhatsApp es asistido: Occhiali prepara el archivo y abre el destinatario y mensaje, pero
la usuaria debe adjuntar el PDF y confirmar el envío manualmente. Los tratamientos describen
características de lentes, no procedimientos médicos.

Inicio funciona como dashboard con conteos reales de clientes activos, recetas y fichas. El layout
incluye una búsqueda global limitada y agrupada, accesible con `Ctrl+K`, que enlaza registros sin
cargar tablas completas en React. El selector de recetas de una ficha usa carga incremental.

Encontrá más información en:

- [Arquitectura](docs/architecture.md)
- [Desarrollo](docs/development.md)
- [Base de datos](docs/database.md)
- [Gestión de clientes](docs/clients.md)
- [Recetas ópticas](docs/prescriptions.md)
- [Fichas ópticas unificadas](docs/optical-jobs.md)
- [Comprobantes de retiro](docs/delivery-receipts.md)
- [Dashboard y búsqueda integrada](docs/search-and-dashboard.md)
- [Seguridad](docs/security.md)
- [Backup y restauración](docs/backup-restore.md)
- [Alertas e historial de respaldos](docs/backup-observability.md)
- [Respaldos automáticos y credenciales protegidas](docs/backup-automation.md)
- [Copias externas robustas y retención segura](docs/backup-resilience.md)
- [Recuperación ante desastres](docs/disaster-recovery.md)
- [Exportación a carpeta sincronizada](docs/cloud-backup.md)
- [Instalador Windows](docs/windows-installer.md)
- [Manual de usuario](docs/manual-usuario.md)
- [Entrega y soporte](docs/entrega-y-soporte.md)
- [Preparación de versión 1.0.0](docs/release-1.0.0.md)
- [Preparación de versión 1.1.0](docs/release-1.1.0.md)
- [Preparación de versión 1.2.0](docs/release-1.2.0.md)
- [Roadmap](docs/roadmap.md)
