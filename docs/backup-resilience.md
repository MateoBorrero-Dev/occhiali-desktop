# Copias externas robustas y retención segura

## Publicación externa

Occhiali sólo acepta una carpeta externa existente, accesible y directa. No crea de nuevo un
destino que desapareció y rechaza symlinks, junctions y rutas cuyo destino real escape de la ruta
seleccionada. Cada transferencia usa un temporal exclusivo administrado por Occhiali, fuerza su
contenido a disco, compara tamaño y SHA-256 con el respaldo local y recién entonces publica el
nombre final. Un archivo final existente sólo se reutiliza si tiene exactamente el mismo tamaño y
hash; nunca se sobrescribe una copia diferente.

La comprobación es local. El estado **Copia externa correcta y verificada localmente** no confirma
que Google Drive, OneDrive u otro cliente haya terminado una sincronización remota.

## Reintentos

Si falla el destino, el `.ocbackup` local ya cifrado y verificado permanece válido. El estado queda
**pendiente** y persiste en `backup-settings.json` sin contraseña, datos personales ni una ruta de
archivo arbitraria. El scheduler reutiliza ese mismo archivo: hace hasta dos reintentos adicionales
(tres intentos totales), primero después de un minuto y luego después de cinco minutos. No crea otro
respaldo SQLite para esos reintentos, no ejecuta loops y respeta la exclusión mutua con creación,
verificación y restauración. Un reinicio conserva el pendiente.

Cada intento se registra como copia externa con trigger `RETRY`. Al agotarse, la interfaz muestra
un fallo externo, pero la copia local no se elimina ni se invalida.

## Retención local

La retención sólo considera nombres exactos `occhiali-backup-AAAAMMDDhhmmssSSS.ocbackup` dentro de
la carpeta local administrada. Antes de eliminar, exige archivo regular, ruta real contenida y
estructura reconocible de un respaldo Occhiali. Nunca sigue symlinks o junctions, nunca toca
temporales ni archivos con otro nombre y no aplica retención al destino externo.

Se conservan como mínimo una copia elegible y la cantidad configurada. También se protegen el
último respaldo local, el pendiente de transferencia y el seleccionado para restauración. Además,
las operaciones críticas comparten un bloqueo, por lo que la retención no compite con creación,
copia, verificación o restauración. Un archivo corrupto, ambiguo o que cambió durante la inspección
se omite; se registra una advertencia de retención en vez de arriesgar una eliminación.

## QA manual aislado en Windows 11

No usar OneDrive, carpetas personales ni la instalación estable. Desde PowerShell en el repositorio:

```powershell
$qaRoot = Join-Path ([IO.Path]::GetTempPath()) ("occhiali-block3-qa-" + [guid]::NewGuid().ToString('N'))
$qaExternal = Join-Path $qaRoot 'external'
New-Item -ItemType Directory -Path $qaExternal -Force | Out-Null
$env:OPTICA_QA_USER_DATA_PATH = $qaRoot
npm run dev
```

1. Crear acceso y datos exclusivamente ficticios. En Configuración → Respaldos, seleccionar
   `$qaExternal`, crear una copia y comprobar estado externo correcto, un solo `.ocbackup` local y
   una copia externa del mismo tamaño. Verificar el respaldo desde la interfaz.
2. Cerrar Occhiali. Comprobar hashes sin abrir ni modificar los archivos:

   ```powershell
   $local = Get-ChildItem -LiteralPath (Join-Path $qaRoot 'backups') -Filter '*.ocbackup' |
     Sort-Object Name -Descending | Select-Object -First 1
   $external = Join-Path $qaExternal $local.Name
   (Get-FileHash -Algorithm SHA256 -LiteralPath $local.FullName).Hash
   (Get-FileHash -Algorithm SHA256 -LiteralPath $external).Hash
   ```

3. Reabrir, conservar seleccionado `$qaExternal`, cerrar y eliminar **sólo** esa carpeta temporal:

   ```powershell
   if (-not ([IO.Path]::GetFullPath($qaExternal)).StartsWith([IO.Path]::GetFullPath($qaRoot), [StringComparison]::OrdinalIgnoreCase)) { throw 'Ruta fuera del perfil QA' }
   Remove-Item -LiteralPath $qaExternal -Recurse -Force
   ```

4. Reabrir y crear otra copia. Debe quedar local válida, externa pendiente e historial parcial. No
   recrear `$qaExternal` desde Occhiali. Después de un minuto, crear nuevamente `$qaExternal` desde
   PowerShell y esperar como máximo un intervalo del scheduler: debe aparecer un evento de
   **Reintento**, publicarse el mismo nombre y no aumentar la cantidad de respaldos locales.
5. Repetir el fallo y cerrar antes del reintento. Reabrir con el mismo perfil, recrear el destino y
   confirmar que el pendiente persiste y se recupera.
6. Para retención, configurar 2 copias y crear al menos 4 en instantes distintos. Agregar a
   `backups` un `notas-personales.txt` y un `.ocbackup` de nombre no administrado. Confirmar que sólo
   rotan respaldos propios reconocidos, quedan al menos 2 y los archivos extraños permanecen.
7. No crear symlinks/junctions manualmente en una carpeta personal. La protección de enlaces se
   cubre automáticamente; si se desea observarla, usar únicamente rutas bajo `$qaRoot`.
8. Confirmar que el historial no contiene contraseñas ni datos ficticios de clientes y que siempre
   indica “sincronización remota no verificada”.

Al finalizar, cerrar Electron y borrar únicamente el perfil validado:

```powershell
$qaFull = [IO.Path]::GetFullPath($qaRoot)
$tempFull = [IO.Path]::GetFullPath([IO.Path]::GetTempPath())
if (-not $qaFull.StartsWith($tempFull, [StringComparison]::OrdinalIgnoreCase)) { throw 'Se rechazó la limpieza fuera de TEMP' }
Remove-Item Env:OPTICA_QA_USER_DATA_PATH
Remove-Item -LiteralPath $qaFull -Recurse -Force
```

## Límites

- Los reintentos requieren que Occhiali esté abierto.
- No se confirma la disponibilidad remota ni se eliminan copias externas automáticamente.
- Un destino que reaparece con un archivo diferente del mismo nombre requiere revisión manual; se
  conserva sin sobrescribirlo.
