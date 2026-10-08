# Sistema de Gestión Óptica

Aplicación de escritorio offline para digitalizar la gestión cotidiana de una óptica pequeña de
Argentina. En su estado actual establece la base técnica y visual; todavía no administra clientes,
recetas ni información comercial.

## Tecnologías

- Electron y electron-vite.
- React con TypeScript estricto.
- Vite y Tailwind CSS.
- Vitest para pruebas automatizadas.
- ESLint y Prettier para calidad y formato.
- SQLite planificado para la Fase 2, con almacenamiento bajo `app.getPath('userData')`.

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
npm run build
```

Para aplicar el formato configurado:

```bash
npm run format
```

## Estado

**Fase 1 — Inicialización y arquitectura:** completada.

La aplicación presenta una pantalla inicial en español, una configuración segura de Electron y un
puente IPC mínimo. No existe todavía un archivo SQLite ni se recopilan datos reales.

Encontrá más información en:

- [Arquitectura](docs/architecture.md)
- [Desarrollo](docs/development.md)
- [Roadmap](docs/roadmap.md)
