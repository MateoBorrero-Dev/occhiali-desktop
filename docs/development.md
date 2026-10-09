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
formularios, búsquedas, mutaciones, estados vacíos y comportamiento accesible de los controles. Las
pruebas de repositorios e IPC usan bases SQLite temporales reales. Ambas complementan, pero no
reemplazan, la inspección visual real en Electron.

### Flujo de QA de clientes

Con `OPTICA_QA_USER_DATA_PATH` apuntando a un directorio temporal nuevo:

1. Abrir Clientes y confirmar el estado vacío.
2. Registrar una persona ficticia, buscarla y abrir su ficha.
3. Editar un dato y cerrar Electron.
4. Reiniciar con la misma ruta temporal y comprobar la persistencia.
5. Archivar, filtrar por Archivados, reactivar y confirmar su regreso a Activos.

Eliminar el perfil temporal únicamente después de cerrar Electron y verificar que su ruta pertenece
al directorio temporal del sistema.

### Flujo de QA de recetas

Con el mismo mecanismo de perfil temporal aislado:

1. Crear un cliente ficticio y registrar una receta con una fila de lejos.
2. Reiniciar Electron con la misma ruta y confirmar persistencia.
3. Crear una segunda receta y buscarla por cliente y fecha.
4. Abrir el detalle, corregir un valor con motivo y consultar la revisión anterior.
5. Confirmar que la segunda receta no cambió.
6. Archivar el cliente, comprobar que el historial sigue visible y que el alta queda bloqueada.
7. Reactivar el cliente.

Las pruebas de Fase 5 también construyen una base con solo las migraciones 001/002 y comprueban que
003 se aplica sin perder recetas ni graduaciones.

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
- Trabajos todavía no permite altas ni edición; ese flujo corresponde a la Fase 6.
- DIP y ALT se conservan por combinación distancia-ojo, pero su interpretación clínica exacta debe
  confirmarse con la dueña antes de imponer nuevas reglas.
- El QA visual de Fase 4 requiere un entorno Windows cuya ventana de Electron pueda ser capturada por
  la herramienta de automatización.
