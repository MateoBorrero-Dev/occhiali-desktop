# Instalador Windows

## Alcance y requisitos

Occhiali 0.9.0 es una versión preliminar offline para Windows 10 u 11 x64. La usuaria final solo
necesita ejecutar el instalador; no necesita Node.js, npm, Git, PowerShell ni herramientas de
desarrollo. No hay versión portable, activación, telemetría, servidor ni actualizaciones
automáticas.

## Generación

Desde un checkout confiable con las dependencias fijadas:

```bash
npm ci --ignore-scripts
npm run package:win
npm run verify:package
```

`--ignore-scripts` evita que npm intente una compilación local innecesaria de `better-sqlite3` y
reduce la ejecución de código durante la instalación. La distribución fijada ya contiene el
prebuild Windows x64; las verificaciones posteriores prueban que Electron puede cargarlo realmente.

electron-builder 26.16.1 genera:

- `release/Occhiali-Setup-0.9.0-x64.exe`: instalador NSIS asistido.
- `release/win-unpacked/Occhiali.exe`: aplicación desempaquetada para inspección.
- `release/Occhiali-Setup-0.9.0-x64.exe.blockmap`: mapa auxiliar; no se usa para autoactualizar.

La versión se identifica con `appId` estable `com.occhiali.desktop`, `productName` y ejecutable
`Occhiali`. NSIS instala por usuario, no solicita elevación, permite elegir carpeta, crea accesos en
Escritorio y menú Inicio y agrega desinstalador.

## Primera ejecución y datos

El primer inicio crea las migraciones SQLite y solicita configurar una contraseña de acceso. Los
datos viven fuera del directorio de instalación:

```text
%APPDATA%\optica-desktop\
  optica.sqlite3
  security.json
  backup-settings.json
  backups\
```

La carpeta `optica-desktop` está fijada deliberadamente para conservar la identidad de datos de las
fases anteriores aunque el nombre visible sea Occhiali. El instalador no incluye una base y nunca
reemplaza una existente por una vacía.

## Actualización manual

Cerrar Occhiali y conservar un backup cifrado verificado antes de ejecutar el instalador posterior.
El nuevo instalador debe mantener `appId`, nombre interno de `userData` y migraciones incrementales.
No debe ejecutar resets ni borrar el perfil. En Fase 9 se comprobó reinstalar 0.9.0 conservando
SQLite, seguridad, configuración y backup byte a byte; todavía no se probó una actualización real
entre dos versiones distintas.

## Desinstalación y reinstalación

El desinstalador retira programa y accesos directos, pero `deleteAppDataOnUninstall` está desactivado.
La prueba real confirmó que el perfil permanece y que la reinstalación puede leerlo. Las carpetas de
exportación o sincronización externas nunca forman parte de la desinstalación.

La eliminación definitiva es una operación separada: cerrar Occhiali, verificar un backup, ejecutar
el desinstalador y luego eliminar manualmente la carpeta exacta `%APPDATA%\optica-desktop` solo por
decisión explícita de la dueña. Nunca automatizar ese borrado desde una actualización.

## SQLite, ASAR y seguridad

Main externaliza `better-sqlite3 13.0.3`. Se incluye únicamente
`prebuilds/win32-x64.node` en `app.asar.unpacked`; las otras arquitecturas y plataformas se excluyen.
No se usa node-gyp durante el empaquetado porque este módulo distribuye un prebuild Node-API.
electron-builder 26.16.1 presenta en este entorno Windows un fallo de su recolector npm; antes de
empaquetar, un parche local idempotente y de coincidencia exacta prioriza el recolector por traversía
que mantiene el propio proveedor. El script comprueba explícitamente `app-builder-lib 26.16.1`; si
cambia esa versión o el archivo upstream, falla cerrado y exige revisión. Se aplica automáticamente
desde los scripts de empaquetado después de una instalación limpia, sin cambios manuales en
`node_modules`. El verificador exige que `better-sqlite3`, `node-addon-api` y el binario x64 estén realmente
incluidos y ejecuta el binario desde Occhiali empaquetado con Electron 44.7.0: aplica migraciones,
inserta, cierra, reabre y consulta.

El mismo escenario configura autenticación, crea y verifica un backup AES-256-GCM, ejecuta la
restauración segura y reabre el resultado. Se mantienen sandbox, `contextIsolation`, CSP, IPC
específico, scrypt y recuperación durable. ASAR fue inspeccionado para descartar SQLite, `.ocbackup`,
`.env`, contraseñas, configuración y perfiles QA.

## Firma, icono y SmartScreen

No se proporcionaron logo oficial ni certificado Authenticode. Esta versión usa el icono
predeterminado de Electron y el instalador está sin firma; Windows puede mostrar editor desconocido
o advertencias de SmartScreen. No se debe desactivar ninguna protección.

Para una entrega final se necesitan un `.ico` oficial multirresolución y un certificado de firma de
código confiable. La clave privada debe permanecer fuera de Git y del instalador, y la firma debe
usar sello de tiempo. Conservar el mismo `appId` y ruta de datos al incorporar esos recursos.

## QA realizado y pendiente

Fase 10 actualizó electron-builder de 26.4.1 a 26.16.1 para retirar vulnerabilidades altas y
críticas de la cadena de empaquetado. La auditoría completa conserva un aviso moderado transitivo en
`sprintf-js`, sin versión corregida publicada; pertenece a herramientas de build y no se incluye en
el runtime de Occhiali. Debe reevaluarse cuando el proveedor publique una corrección compatible.

Se generó e inspeccionó el instalador real. Se instaló silenciosamente en una carpeta temporal, se
comprobaron ejecutable, desinstalador y accesos directos, y la aplicación instalada abrió una ventana
real. El runtime instalado validó SQLite, migraciones, persistencia, autenticación, backup y
restauración. Después se desinstaló, se verificaron hashes del perfil, se reinstaló y se volvió a
leer la información.

El controlador gráfico detectó la ventana, pero agotó el tiempo de aprobación al capturarla. Quedan
pendientes el asistente visible, el flujo completo por UI, restauración con reinicio del `.exe`,
resoluciones 820×600, 1180×760, 1366×768 y 1920×1080, icono final y actualización entre dos
versiones distintas.

## Checklist de entrega

- Ejecutar todas las validaciones y `npm run verify:package`.
- Revisar versión, `appId`, SHA-256, firma e icono.
- Inspeccionar ASAR y el binario nativo x64.
- Probar instalación limpia con un perfil aislado.
- Probar login, clientes, recetas, fichas, búsqueda y dashboard offline.
- Crear, verificar y restaurar un backup cifrado.
- Reiniciar el ejecutable instalado y confirmar persistencia.
- Probar actualización real desde la versión anterior.
- Desinstalar/reinstalar y confirmar que `userData` permanece.
- Entregar instrucciones de backup y la limitación de SmartScreen.
