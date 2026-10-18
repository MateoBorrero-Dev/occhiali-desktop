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
npm run test:electron
npm run build
npm run package
npm run verify
npm audit
git diff --check
```

- `typecheck` valida por separado los contextos Node/Electron y web.
- `lint` usa la configuración plana de ESLint y reglas con información de tipos.
- `format:check` comprueba el formato sin modificar archivos.
- `test` ejecuta Vitest una sola vez.
- `test:electron` carga el binario nativo en Electron y usa una base temporal aislada.
- `build` repite el typecheck y genera `out/main`, `out/preload` y `out/renderer`.
- `package` delega en `package:win` y genera `release/win-unpacked` y el instalador NSIS x64.
- `verify` delega en `verify:package`, inspecciona ASAR, comprueba el icono oficial por SHA-256 y
  ejecuta dos veces el runtime empaquetado sobre un perfil temporal; prueba migraciones,
  persistencia, acceso local, backup y restauración.

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

### Flujo de QA de fichas de trabajo

Con un perfil temporal aislado:

1. Crear un cliente y una receta ficticios.
2. Registrar anteojos recetados con número, armazón, receta y tratamientos.
3. Abrir el detalle y editar el modelo y los acabados.
4. Crear lentes de sol sin receta y confirmar que son válidos.
5. Buscar ambas fichas, reiniciar Electron y comprobar persistencia.
6. Archivar el cliente, consultar sus fichas y verificar el bloqueo de nuevas altas.
7. Reactivar el cliente y eliminar el perfil temporal después de cerrar Electron.

### Flujo de QA de dashboard y búsqueda

Siempre con `OPTICA_QA_USER_DATA_PATH` apuntando a un perfil temporal:

1. Confirmar ceros en Inicio y registrar cliente, receta y ficha ficticios.
2. Volver a Inicio y comprobar los tres conteos.
3. Buscar por nombre, DNI, teléfono, número de ficha y producto.
4. Abrir cliente, receta y ficha desde los grupos de resultados.
5. Probar `Ctrl+K`, `Escape`, limpieza, filtros y paginación.
6. Archivar el cliente: el indicador activo disminuye y los historiales siguen contabilizados.
7. En una ficha con más de 100 recetas, cargar páginas adicionales y elegir una receta anterior.
8. Reiniciar con el mismo perfil, confirmar persistencia y eliminarlo solo tras cerrar Electron.

### Flujo de QA de seguridad y recuperación

Con `OPTICA_QA_USER_DATA_PATH` en un directorio temporal nuevo:

1. Configurar una contraseña ficticia, cerrar, reabrir y comprobar el bloqueo.
2. Crear cliente, receta, corrección, ficha y tratamiento ficticios.
3. En Configuración, crear un `.ocbackup` con una contraseña de recuperación distinta.
4. Verificarlo, exportarlo a otra carpeta temporal y confirmar que la UI no afirma una subida cloud.
5. Probar una contraseña incorrecta y comprobar que la base activa no cambia.
6. Restaurar en un segundo perfil aislado, comparar IDs e historiales y realizar una escritura nueva.
7. Probar bloqueo manual, inactividad y operación offline.

El hardening se verifica además en `tests/restore-hardening-phase8.test.ts`: usa archivos y bases
SQLite reales para interrumpir cada fase, ejecutar la recuperación del siguiente arranque, comprobar
el contenido anterior o restaurado según el marcador y confirmar la limpieza de rollback y staging.

No registrar ni reutilizar las contraseñas ficticias. No apuntar estas variables al perfil habitual.
La prueba automatizada equivalente vive en `tests/security-backup-phase8.test.ts`.

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

El build intermedio se guarda en `out/` y la distribución en `release/`; ninguno se versiona. El
punto de entrada de Electron es `out/main/index.js`, configurado mediante el campo `main` de
`package.json`. El procedimiento detallado está en [windows-installer.md](windows-installer.md).

## Reglas para cambios futuros

`tests/phase10-stability.test.ts` es una integración con archivos y SQLite reales en un directorio
temporal. Genera 1.000 clientes ficticios y recorre recetas, revisiones, fichas, tratamientos,
dashboard, búsqueda, archivo/reactivación, backup AES-256-GCM, restauración y persistencia. Sus
límites temporales son deliberadamente amplios para detectar bloqueos graves sin convertir una
medición de un equipo particular en una exigencia de producción.

- La interfaz no debe importar Node.js ni Electron.
- Todo IPC debe usar un canal enumerado y validación de argumentos.
- La base de datos solo se abrirá desde el proceso principal.
- No deben guardarse datos del negocio dentro del repositorio o del paquete instalado.
- No deben usarse datos reales en pruebas automatizadas.
- Los módulos sin persistencia funcional deben usar estados vacíos explícitos, no datos simulados.
- Los controles interactivos deben conservar foco visible y semántica de teclado.
- Las copias deben seguir usando la API de backup de SQLite; nunca copiar en caliente solo el archivo
  principal mientras WAL esté activo.
- Todo cambio del formato `.ocbackup` debe versionarse y conservar autenticación de cabecera y carga.
- Nunca agregar almacenamiento en texto plano de la contraseña de recuperación para automatizar.
- No mover ni eliminar manualmente `.restore-state.json`, `.restore-rollback` o staging durante una
  recuperación. Un estado inconsistente debe fallar cerrado y revisarse sobre una copia del perfil.

## Problemas conocidos

- La auditoría de dependencias de desarrollo conserva un aviso moderado transitivo en `sprintf-js`
  a través de electron-builder. El advisory no publica una versión corregida. No alcanza al runtime
  instalado y debe revisarse cuando exista una actualización compatible del proveedor.
- El instalador de prueba usa el icono oficial de Occhiali, pero continúa sin certificado
  Authenticode. Windows puede mostrar advertencias de SmartScreen.
- La actualización manual entre dos versiones distintas todavía requiere QA real; la
  desinstalación/reinstalación de 0.9.0 sí fue validada conservando el perfil temporal.
- DIP y ALT se conservan por combinación distancia-ojo, pero su interpretación clínica exacta debe
  confirmarse con la dueña antes de imponer nuevas reglas.
- No existen precios, ventas, stock, pagos ni estados logísticos; son dominios fuera de Fase 8.
- El QA visual de Fase 4 requiere un entorno Windows cuya ventana de Electron pueda ser capturada por
  la herramienta de automatización.
- El controlador gráfico detectó la ventana instalada, pero agotó el tiempo de aprobación al
  capturarla; el recorrido visual y funcional completo debe repetirse manualmente con un perfil
  aislado.
- La programación de backup es asistida: recuerda la copia, pero no guarda la clave ni ejecuta con
  la aplicación cerrada.
- El login local no cifra SQLite; el equipo operativo necesita cifrado de disco.
