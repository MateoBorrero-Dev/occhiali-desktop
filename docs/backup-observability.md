# Alertas e historial de respaldos

## Alcance de 1.1.0 — Bloque 1

Este bloque agrega observabilidad al sistema de respaldos existente. No ejecuta copias automáticas,
no guarda la contraseña de recuperación y no modifica el formato `OCCHIALI_BACKUP` v1.

React obtiene el estado y el historial mediante IPC explícito y autenticado. Main calcula los estados
con información persistida y comprobaciones de existencia de archivos; no descifra SQLite en cada
renderizado.

## Estado del último respaldo

`BackupService.status()` informa:

- fecha, tamaño y antigüedad del último respaldo creado y verificado;
- existencia actual del archivo local administrado;
- vencimiento del recordatorio según la hora local configurada;
- alerta después de 24 horas y alerta crítica después de 72 horas;
- último resultado de la copia externa;
- ausencia de una copia externa previamente depositada;
- sincronización remota siempre como no verificada.

La primera ejecución del bloque inicia una gracia de 24 horas. Una restauración confirmada también
actualiza la referencia de recuperación, evitando una advertencia falsa inmediatamente después del
reinicio. La desaparición de un archivo ya registrado se informa de inmediato.

## Historial

El historial se almacena en `backup-history.json`, junto a `backup-settings.json` dentro de
`userData`. Es independiente de SQLite para evitar que el registro del propio respaldo forme parte
de la instantánea que intenta describir.

El archivo tiene versión propia, conserva como máximo 90 eventos y se publica mediante un `.next`
sincronizado a disco y renombrado en el mismo directorio. Si está dañado, se preserva con sufijo
`.corrupt-<fecha>` y se inicia un historial vacío. Si el archivo dañado no puede ponerse en
cuarentena, se conserva en su ubicación y se bloquean nuevas escrituras para no sobrescribirlo. Un
fallo al escribir el historial no invalida un respaldo ni revierte una restauración confirmada.

Cada evento puede registrar creación, verificación, copia externa o restauración; resultado correcto,
parcial o fallido; estado local y externo; nombre administrado, tamaño y mensaje sanitizado. Nunca
incluye contraseñas, claves, datos de clientes ni rutas elegidas por la usuaria. Los nombres externos
no administrados se reemplazan por la referencia `respaldo-seleccionado.ocbackup`.

## Alertas e interfaz

El layout consulta el estado después de autenticar y muestra una advertencia global cuando:

- pasaron al menos 24 horas sin un respaldo válido;
- pasaron al menos 72 horas, con prioridad crítica;
- el último archivo local desapareció;
- falló o desapareció la copia externa.

La alerta enlaza directamente con `Configuración → Respaldos`. Mientras la interfaz está abierta,
el estado se vuelve a consultar cada cinco minutos para que los umbrales aparezcan sin reiniciar la
aplicación; esta consulta no crea respaldos ni constituye un scheduler. Configuración presenta el
resumen, el estado externo y los últimos diez eventos en una tabla con scroll horizontal interno.
Depositar un archivo en una carpeta sincronizada nunca se presenta como confirmación de subida a la
nube. La existencia del archivo tampoco sustituye la verificación manual de su contenido cifrado.

## Evolución en el Bloque 2

El Bloque 2 agrega un modo automático optativo con credencial protegida. Las alertas y el historial
de este documento se conservan y ahora distinguen ejecuciones manuales y automáticas. Consultar
[Respaldos automáticos y credenciales protegidas](backup-automation.md).

## Límites pendientes

- El scheduler sólo funciona mientras Occhiali está abierto.
- La contraseña se introduce manualmente para cada creación o restauración.
- Occhiali no consulta APIs de Google Drive ni OneDrive.
- El historial es operativo y local; no sustituye una copia externa del `.ocbackup`.
- La retención avanzada de copias externas corresponde al Bloque 3.

## QA manual en Windows

Realizar este recorrido sólo con la aplicación de desarrollo cerrada al cambiar archivos y con un
perfil temporal nuevo:

```powershell
$qaRoot = Join-Path ([IO.Path]::GetTempPath()) ("occhiali-backup-alerts-qa-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $qaRoot | Out-Null
$env:OPTICA_QA_USER_DATA_PATH = $qaRoot
npm run dev
```

1. Configurar una contraseña ficticia, ingresar y confirmar que durante la gracia inicial no haya
   alerta ni eventos históricos inventados.
2. En Configuración → Respaldos, crear un respaldo con una contraseña de recuperación ficticia.
   Comprobar fecha local, antigüedad, tamaño, archivo disponible y evento de creación correcto.
3. Seleccionar una carpeta externa ubicada dentro de `$qaRoot`, crear otra copia y confirmar el
   evento externo. La interfaz debe decir que el archivo fue depositado y que la sincronización
   remota no fue verificada; nunca debe afirmar que ya está en la nube.
4. Cerrar la aplicación. En el `backup-settings.json` temporal, cambiar `lastBackupAt` primero a 25
   horas atrás y luego a 73 horas atrás, reiniciando entre ambos casos. Confirmar advertencia ámbar,
   alerta crítica y acceso directo a Configuración → Respaldos.
5. Con la aplicación cerrada, mover únicamente el último `.ocbackup` del subdirectorio `backups`
   temporal. Al reiniciar debe aparecer de inmediato la alerta de archivo local ausente.
6. Repetir con un perfil temporal nuevo: configurar una carpeta externa bajo `$qaRoot`, cerrarla,
   eliminar sólo esa carpeta temporal y crear un respaldo. Confirmar que la copia local sea válida,
   que el fallo externo siga visible y que el historial muestre resultado parcial más exportación
   fallida.
7. Con la aplicación cerrada, guardar una copia de `backup-history.json` y reemplazar el original
   temporal por JSON inválido. Al reiniciar debe preservarse un archivo `.corrupt-<fecha>`, comenzar
   un historial vacío y mostrarse la advertencia de recuperación sin impedir nuevos respaldos.
8. Seleccionar y verificar un respaldo temporal; restaurarlo sobre datos exclusivamente ficticios,
   aceptar el reinicio y comprobar el evento de restauración, la persistencia y la ausencia de rutas
   o contraseñas en el historial.
9. Reducir la ventana hasta su mínimo, recorrer pantallas y confirmar que la alerta se adapta, que
   el contenido principal conserva scroll vertical y que la tabla usa scroll horizontal interno.

Después de cerrar Electron, limpiar exclusivamente el perfil cuyo valor está guardado en `$qaRoot`:

```powershell
Remove-Item Env:OPTICA_QA_USER_DATA_PATH
Remove-Item -LiteralPath $qaRoot -Recurse -Force
```
