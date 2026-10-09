# Desarrollo

## Preparación

Desde la raíz del repositorio:

```bash
npm install
```

Las versiones exactas se resuelven desde `package-lock.json`. No se requieren servicios externos ni
contenedores. La base SQLite de desarrollo se crea en el directorio `userData` de Electron.

## Iniciar la aplicación

```bash
npm run dev
```

El proceso queda activo mientras la ventana de Electron esté abierta. Los cambios del renderer se
recargan mediante Vite; los cambios en main o preload reinician el proceso correspondiente.

## Verificaciones

```bash
npm run typecheck
npm run lint
npm run format:check
npm test
npm run test:electron:sqlite
npm run build
npm audit
git diff --check
```

- `typecheck` valida por separado los contextos Node/Electron y web.
- `lint` usa la configuración plana de ESLint y reglas con información de tipos.
- `format:check` comprueba el formato sin modificar archivos.
- `test` ejecuta Vitest una sola vez.
- `test:electron:sqlite` carga el binario nativo en Electron y usa una base temporal aislada.
- `build` repite el typecheck y genera `out/main`, `out/preload` y `out/renderer`.

Las pruebas Vitest crean cada base debajo del directorio temporal del sistema. Nunca usan
`app.getPath('userData')`. Para QA manual del arranque completo se puede establecer
`OPTICA_QA_USER_DATA_PATH` con una ruta absoluta temporal antes de iniciar Electron.

Para inspeccionar expresamente el layout en el tamaño mínimo de ventana se puede agregar
`OPTICA_QA_WINDOW_SIZE=minimum`. Esta opción solo modifica el tamaño inicial durante QA; no altera el
mínimo permitido ni el tamaño normal de producción. Ambas variables deben apuntar a un entorno
temporal aislado y no se usan en la operación cotidiana.

Las pruebas de `tests/renderer` usan Testing Library y jsdom para verificar rutas, estado activo,
accesos rápidos, estados vacíos y comportamiento accesible de los controles. Complementan, pero no
reemplazan, la inspección visual real en Electron.

## Interfaz y navegación

La aplicación usa `HashRouter`, de modo que las URLs permanecen dentro del archivo HTML local al
ejecutarse empaquetada. Las rutas se declaran en `src/renderer/src/app/App.tsx`; todas comparten
`AppLayout`, y el sidebar usa `NavLink` para exponer el estado activo.

Al crear una página nueva:

1. Agregar el componente en `src/renderer/src/pages`.
2. Declarar la ruta dentro de `AppLayout`.
3. Incorporar el acceso al sidebar solo si será un módulo principal.
4. Reutilizar `PageHeader`, `Card`, `EmptyState`, `ModulePlaceholder` y `Button` antes de crear una
   variante específica.
5. Añadir pruebas de navegación y teclado acordes al cambio.

## Estructura de salida

Los artefactos generados se guardan en `out/` y no se versionan. El punto de entrada de Electron es
`out/main/index.js`, configurado mediante el campo `main` de `package.json`.

## Reglas para cambios futuros

- La interfaz no debe importar Node.js ni Electron.
- Todo IPC debe usar un canal enumerado y validación de argumentos.
- La base de datos solo se abrirá desde el proceso principal.
- No deben guardarse datos del negocio dentro del repositorio o del paquete instalado.
- No deben usarse datos reales en pruebas automatizadas.
- Los módulos sin persistencia funcional deben usar estados vacíos explícitos, no datos simulados.
- Los controles interactivos deben conservar foco visible y semántica de teclado.
- Las copias futuras deben usar la API de backup de SQLite, no copiar en caliente solo el archivo
  principal mientras WAL esté activo.

## Problemas conocidos

- No hay instalador en esta fase; su configuración corresponde a la Fase 9.
- El futuro empaquetado debe conservar el binario `.node` fuera de `app.asar` mediante
  `asarUnpack`; todavía no se generó un instalador.
- Clientes, recetas y trabajos todavía no permiten altas ni edición; esos flujos corresponden a las
  Fases 4 a 6.
