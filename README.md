# Sistema de Gestión Óptica

Aplicación de escritorio offline para digitalizar la gestión cotidiana de una óptica pequeña de
Argentina. Dispone de una base técnica y de persistencia, además de una interfaz de escritorio con
navegación y un módulo de clientes conectado al almacenamiento local.

## Tecnologías

- Electron y electron-vite.
- React con TypeScript estricto.
- Vite y Tailwind CSS.
- React Router para navegación local compatible con la aplicación empaquetada.
- Lucide React para iconografía accesible y consistente.
- Vitest para pruebas automatizadas.
- ESLint y Prettier para calidad y formato.
- SQLite mediante `better-sqlite3`, con almacenamiento bajo `app.getPath('userData')`.

Las versiones exactas instaladas están fijadas en `package.json` y `package-lock.json`.

## Requisitos

- Node.js 22.12 o posterior. Se recomienda una versión LTS compatible.
- npm 10 o posterior.
- Windows 10 u 11 para el entorno objetivo.

## Instalación

```bash
npm install
```

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
npm run test:electron:sqlite
npm run build
```

Para aplicar el formato configurado:

```bash
npm run format
```

## Estado

**Fase 1 — Inicialización y arquitectura:** completada.

**Fase 2 — SQLite, modelo de datos y persistencia:** completada.

**Fase 3 — Diseño de interfaz y navegación:** completada.

**Fase 4 — Gestión de clientes:** implementación completada; QA visual manual pendiente.

La aplicación permite registrar, buscar, consultar, editar, archivar y reactivar clientes. Los
datos se guardan en SQLite mediante canales IPC específicos y validados; no se usan datos simulados
ni `localStorage`. Los módulos de recetas y trabajos continúan mostrando estados vacíos honestos.
No se recopilan datos reales automáticamente: la única carga inicial es el catálogo de
tratamientos.

Encontrá más información en:

- [Arquitectura](docs/architecture.md)
- [Desarrollo](docs/development.md)
- [Base de datos](docs/database.md)
- [Gestión de clientes](docs/clients.md)
- [Roadmap](docs/roadmap.md)
