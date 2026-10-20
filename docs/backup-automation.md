# Respaldos automáticos y credenciales protegidas

## Alcance de 1.1.0 — Bloque 2

Occhiali puede crear el respaldo diario pendiente mientras la aplicación permanece abierta. No es
un servicio de Windows: con la aplicación cerrada no se ejecutan tareas. El modo asistido continúa
disponible y la automatización debe activarse expresamente.

El formato `OCCHIALI_BACKUP` v1, la verificación SQLite, el cifrado AES-256-GCM, la publicación
atómica y la compatibilidad con copias 0.9.0/1.0.0 no cambian.

## Credencial protegida

La contraseña de recuperación automática se cifra en Main mediante la API asíncrona `safeStorage`
de Electron. El archivo `backup-credential.json` sólo contiene versión y bytes protegidos en Base64;
se escribe mediante un archivo `.next`, `fsync` y renombrado. Está excluido de Git y del paquete.

En Windows, `safeStorage` protege las claves mediante DPAPI. Esto ayuda a impedir que otra cuenta de
Windows descifre la credencial, pero no protege frente a malware u otro proceso que ya se ejecute
con la misma identidad de la usuaria. Conviene mantener Windows actualizado, usar protección
antimalware y restringir el acceso a la cuenta. Referencia:
[safeStorage de Electron](https://www.electronjs.org/docs/latest/api/safe-storage).

La credencial:

- no es la contraseña de acceso local;
- nunca se devuelve por IPC, se muestra, se registra ni se incluye en el historial;
- puede reemplazarse o eliminarse explícitamente;
- bloquea la automatización si falta, está dañada o `safeStorage` no está disponible;
- no sustituye conservar la contraseña de recuperación fuera de la computadora.

## Scheduler y concurrencia

`BackupScheduler` vive en Main y consulta el estado:

- inmediatamente después del inicio;
- cada minuto mientras Occhiali está abierto;
- al recibir `powerMonitor.resume` después de una suspensión;
- después de cambios de configuración o credencial.

El corte diario se calcula con el calendario y la hora local actuales. Un intento queda asociado a
su ventana programada para evitar duplicados, incluso si cambia el reloj o desaparece el último
archivo. Un fallo permanece visible y no se repite cada minuto; la siguiente ventana diaria vuelve
a intentarlo. Reemplazar la credencial o cambiar la programación habilita un nuevo intento pendiente.
Al activar por primera vez después de la hora elegida, la copia de ese día queda pendiente de
inmediato; si se activa antes, espera al corte de hoy. Una copia manual válida sólo cubre la ventana
automática cuando fue creada después de ese corte.

Creación manual, creación automática y restauración comparten exclusión mutua. Durante una
restauración el scheduler no comienza trabajos. Si se solicita cerrar Occhiali mientras una operación
crítica está activa, Main detiene el scheduler, espera que finalice y recién entonces cierra SQLite.
La credencial protegida tampoco puede reemplazarse ni eliminarse durante esas operaciones; si cambia
mientras el scheduler la está obteniendo, ese intento se cancela antes de crear el respaldo.

La exportación externa fallida no invalida el respaldo local: se informa como resultado parcial,
queda pendiente y se reintenta de forma acotada sobre el mismo archivo. La sincronización remota
continúa figurando como no verificada.

## Historial

Los eventos de creación y exportación incluyen `trigger: MANUAL | AUTOMATIC | RETRY`. Una ejecución
automática registra inicio y resultado final. Los errores previos a la creación, como credencial
ausente o dañada, se sanitizan y registran sin secretos ni rutas.

## Compatibilidad de configuración

La configuración automática tiene versión propia. Un `automaticEnabled` guardado por el Bloque 1
era sólo un recordatorio y se migra al modo asistido; nunca activa automáticamente el scheduler tras
actualizar. La activación real del Bloque 2 requiere guardar una credencial y elegir el modo
automático.

## QA manual en Windows

Usar exclusivamente un perfil temporal y una contraseña ficticia:

```powershell
$qaRoot = Join-Path ([IO.Path]::GetTempPath()) ("occhiali-auto-backup-qa-" + [guid]::NewGuid().ToString('N'))
New-Item -ItemType Directory -Path $qaRoot | Out-Null
$env:OPTICA_QA_USER_DATA_PATH = $qaRoot
npm run dev
```

1. Configurar el acceso con datos ficticios. En Configuración → Respaldos, confirmar “Modo
   asistido” y credencial no configurada.
2. Ingresar dos veces una contraseña ficticia de al menos 12 caracteres y protegerla. Cerrar y
   reabrir con el mismo `$qaRoot`; debe continuar como configurada sin mostrar su valor.
3. Con Electron cerrado, abrir `backup-credential.json` sólo para inspección y confirmar que no
   contiene la contraseña legible. No editar el archivo para esta prueba.
4. Elegir modo automático y la hora local actual. Guardar la programación: si la ventana está
   pendiente, debe generarse una copia local, aparecer “Creación automática” en el historial y no
   generarse una segunda copia durante la misma ventana.
5. Configurar una carpeta externa dentro de `$qaRoot`, preservar fuera de `backups` la última copia
   local temporal, eliminar únicamente la carpeta externa temporal y reiniciar la programación del
   mismo perfil. Confirmar respaldo local válido, advertencia externa, creación automática parcial y
   evento de copia externa fallido. El procedimiento detallado se encuentra en “Fallo externo
   aislado” más abajo.
6. Cerrar antes de una ventana pendiente y volver a abrir después del horario. Confirmar que el
   respaldo se recupera al iniciar.
7. Preparar otra ventana pendiente, suspender Windows con Occhiali abierto y reanudar después del
   horario. Confirmar una única ejecución.
8. Mientras una copia grande esté activa, solicitar cerrar la aplicación. Debe esperar la
   finalización, no dejar `.partial` y reabrir con SQLite íntegra.
9. Con la aplicación cerrada, copiar la credencial temporal, dañarla y reiniciar. La automatización
   debe quedar bloqueada, sin error global ni pérdida de datos; reemplazarla debe recuperar el modo.
10. Si hay una segunda cuenta Windows de QA, copiar únicamente el perfil temporal a esa cuenta y
    comprobar que DPAPI no permite descifrar la credencial. No usar perfiles habituales.
11. Eliminar la credencial desde la interfaz y confirmar que el modo vuelve a asistido. Reiniciar y
    verificar que `backup-credential.json` no reaparece.
12. Reducir la ventana a su mínimo y revisar radios, campos, mensajes, botones e historial sin
    desbordamiento externo.

### Fallo externo aislado

Esta prueba no requiere modificar permisos ni usar OneDrive. Con Occhiali cerrado y conservando el
mismo `$qaRoot`, validar y preparar únicamente rutas internas del perfil temporal:

```powershell
$qaRoot = [Environment]::GetEnvironmentVariable('OPTICA_QA_USER_DATA_PATH', 'Process')
if ([string]::IsNullOrWhiteSpace($qaRoot)) { throw 'No hay un perfil temporal configurado.' }
$qaRoot = [IO.Path]::GetFullPath($qaRoot)
$tempRoot = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\') + '\'
$qaRootPrefix = $qaRoot.TrimEnd('\') + '\'
if (-not $qaRootPrefix.StartsWith($tempRoot, [StringComparison]::OrdinalIgnoreCase)) {
  throw 'El perfil no está dentro de la carpeta temporal de Windows.'
}

$externalFailure = Join-Path $qaRoot 'qa-external-failure'
New-Item -ItemType Directory -Path $externalFailure -Force | Out-Null
```

Abrir Occhiali, seleccionar `$externalFailure` como carpeta externa y volver a cerrarlo. Luego
preservar la copia anterior fuera del directorio observado y eliminar sólo el destino ficticio:

```powershell
$settings = Get-Content -LiteralPath (Join-Path $qaRoot 'backup-settings.json') -Raw |
  ConvertFrom-Json
$lastName = [string]$settings.lastBackupFile
if ($lastName -notmatch '^occhiali-backup-\d{17}\.ocbackup$') {
  throw 'El nombre del último respaldo temporal no es válido.'
}
$lastPath = Join-Path (Join-Path $qaRoot 'backups') $lastName
$preserved = Join-Path $qaRoot 'qa-preserved'
New-Item -ItemType Directory -Path $preserved -Force | Out-Null
Move-Item -LiteralPath $lastPath -Destination (Join-Path $preserved $lastName)
Remove-Item -LiteralPath $externalFailure -Recurse -Force
```

Reabrir Occhiali con el mismo perfil, guardar primero el modo asistido y después activar el modo
automático con la hora local actual. La ausencia controlada de la copia anterior vuelve pendiente la
ventana y el cambio de modo habilita un nuevo intento. Deben aparecer: un archivo local nuevo y
verificable, advertencia de copia externa pendiente, `Creación — Parcial` y
`Copia externa — Parcial`. Si el destino reaparece, los reintentos se registran por separado.

Al terminar, cerrar Electron y eliminar solamente el perfil temporal registrado en `$qaRoot`:

```powershell
Remove-Item Env:OPTICA_QA_USER_DATA_PATH
Remove-Item -LiteralPath $qaRoot -Recurse -Force
```

## Limitaciones

- No hay ejecución con Occhiali cerrado.
- No hay servicio, tarea programada ni notificación del sistema operativo.
- No se confirma la subida real a Google Drive u OneDrive.
- DPAPI no constituye defensa frente a malware con la misma cuenta Windows.
- La retención no elimina automáticamente copias externas; su disponibilidad remota sigue bajo
  control del cliente de sincronización y de la usuaria.
