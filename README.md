# Sistema de Gestión Óptica

Aplicación de escritorio offline para digitalizar la gestión cotidiana de una óptica pequeña de
Argentina. Dispone de una base técnica y de persistencia, además de una interfaz de escritorio con
navegación y módulos de clientes, recetas y fichas de trabajo conectados al almacenamiento local.

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

La usuaria final solo necesita Windows 10 u 11 x64 y el instalador generado. No necesita Node.js,
npm, Git ni herramientas de desarrollo. La instalación y sus limitaciones están documentadas en
[Instalador Windows](docs/windows-installer.md).

La aplicación permite gestionar clientes y registrar, buscar, consultar y corregir recetas ópticas
con historial de revisiones. Los valores FAR/NEAR, OD/OI y las adiciones independientes por ojo se guardan como enteros escalados en
SQLite mediante canales IPC específicos y validados; no se usan datos simulados ni `localStorage`.
Las fichas de trabajo registran productos, armazones, tratamientos y acabados comerciales,
coloración y una receta opcional. Los tratamientos describen características de lentes, no
procedimientos médicos. No se recopilan datos reales automáticamente: la única carga inicial es el
catálogo de tratamientos.

Inicio funciona como dashboard con conteos reales de clientes activos, recetas y fichas. El layout
incluye una búsqueda global limitada y agrupada, accesible con `Ctrl+K`, que enlaza registros sin
cargar tablas completas en React. El selector de recetas de una ficha usa carga incremental.

Encontrá más información en:

- [Arquitectura](docs/architecture.md)
- [Desarrollo](docs/development.md)
- [Base de datos](docs/database.md)
- [Gestión de clientes](docs/clients.md)
- [Recetas ópticas](docs/prescriptions.md)
- [Fichas de trabajo](docs/optical-jobs.md)
- [Comprobantes de retiro](docs/delivery-receipts.md)
- [Dashboard y búsqueda integrada](docs/search-and-dashboard.md)
- [Seguridad](docs/security.md)
- [Backup y restauración](docs/backup-restore.md)
- [Alertas e historial de respaldos](docs/backup-observability.md)
- [Respaldos automáticos y credenciales protegidas](docs/backup-automation.md)
- [Exportación a carpeta sincronizada](docs/cloud-backup.md)
- [Instalador Windows](docs/windows-installer.md)
- [Manual de usuario](docs/manual-usuario.md)
- [Entrega y soporte](docs/entrega-y-soporte.md)
- [Preparación de versión 1.0.0](docs/release-1.0.0.md)
- [Roadmap](docs/roadmap.md)
