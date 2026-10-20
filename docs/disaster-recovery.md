# Recuperación ante desastres

## Garantía y alcance

Un archivo `.ocbackup` válido contiene una copia consistente de la base SQLite comercial. Incluye
clientes, recetas y sus revisiones, graduaciones, fichas ópticas y sus productos, tratamientos,
comprobantes de retiro, eventos y secuencias. El contenedor `OCCHIALI_BACKUP` versión 1 cifra la base
con AES-256-GCM y deriva la clave desde la contraseña de recuperación mediante scrypt. La cabecera y
el contenido están autenticados.

La contraseña de recuperación no depende de la contraseña de acceso a Occhiali, Electron
`safeStorage`, DPAPI ni la cuenta de Windows donde se creó el respaldo. Por eso el archivo puede
restaurarse en otro equipo usando únicamente esa contraseña. DPAPI protege solamente la copia local
opcional de la contraseña que usa el scheduler automático.

No forman parte del respaldo:

- la contraseña de acceso local y `security.json`;
- la credencial automática protegida y `backup-credential.json`;
- programación, carpeta externa y estado de reintentos de `backup-settings.json`;
- historial operativo `backup-history.json`;
- otros `.ocbackup`, comprobantes PDF exportados ni archivos externos.

En una computadora nueva se debe crear una contraseña de acceso local, restaurar la base con la
contraseña de recuperación y volver a configurar automatización y destino externo. Las copias y PDF
que se quieran conservar deben trasladarse por separado.

## Compatibilidad comprobada

Los commits publicados de 0.9.0 y 1.0.0 usan la misma marca, formato 1, AAD, scrypt
(`N=32768`, `r=8`, `p=1`) y AES-256-GCM. Las migraciones históricas 001–006 no fueron modificadas.
Las pruebas de compatibilidad generan fixtures controlados con una implementación criptográfica
independiente, identificados como 0.9.0 y 1.0.0, y los abren desde un perfil nuevo sin DPAPI. No se
limitan a cambiar la etiqueta de un respaldo producido por `BackupService`.

Un respaldo anterior compatible se descifra en staging, se abre y recibe únicamente migraciones
incrementales conocidas. Un formato desconocido o una migración futura se rechaza. Contraseña
incorrecta, tag alterado, archivo corrupto o truncado también se rechazan antes de cerrar o mover la
base activa.

## Restauración conservadora

Verificar un archivo nunca reemplaza datos. Antes de confirmar, la interfaz informa la fecha y
versión del respaldo y advierte que los cambios posteriores dejarán de estar activos. No existe una
restauración automática silenciosa.

Al confirmar, Occhiali crea primero un `.ocbackup` preventivo de la base actual. La sustitución usa
staging, rollback y un marcador durable con fases sincronizadas. La candidata se abre, migra y pasa
`integrity_check` y `foreign_key_check` antes de quedar confirmada. Si falla antes de la confirmación,
se conserva o repone la base anterior. Si SQLite ya se cerró, el bloqueo de restauración se mantiene
hasta el relanzamiento: el scheduler, la retención y los reintentos externos no pueden operar sobre
la conexión cerrada ni competir con el rollback.

El riesgo operativo restante es deliberado: restaurar una copia antigua reemplaza la base activa y
puede ocultar trabajo posterior. La copia preventiva permite recuperarlo, pero la usuaria debe
comparar fecha y versión antes de confirmar.

## QA manual aislado en Windows

Usar datos ficticios y rutas nuevas bajo `%TEMP%`. No usar la instalación estable, OneDrive ni
carpetas personales. En PowerShell, desde el repositorio:

```powershell
$qaBase = Join-Path ([IO.Path]::GetTempPath()) ("occhiali-dr-qa-" + [guid]::NewGuid().ToString('N'))
$qaSource = Join-Path $qaBase 'source-profile'
$qaTarget = Join-Path $qaBase 'target-profile'
$qaExchange = Join-Path $qaBase 'exchange'
New-Item -ItemType Directory -Path $qaSource, $qaTarget, $qaExchange -Force | Out-Null
$env:OPTICA_QA_USER_DATA_PATH = $qaSource
npm run dev
```

1. En el perfil fuente, crear una contraseña de acceso ficticia. Registrar un cliente, una receta
   con graduaciones, una ficha con producto y tratamientos y un comprobante de retiro ficticios.
2. En Configuración, crear un respaldo con una contraseña de recuperación ficticia de al menos 12
   caracteres. Seleccionarlo y verificarlo. Cerrar Occhiali.
3. Copiar el respaldo fuera del perfil, sin mover ni editar el original:

   ```powershell
   $backup = Get-ChildItem -LiteralPath (Join-Path $qaSource 'backups') -Filter '*.ocbackup' |
     Sort-Object Name -Descending | Select-Object -First 1
   if (-not $backup) { throw 'No se encontró el respaldo QA.' }
   $transferred = Join-Path $qaExchange $backup.Name
   Copy-Item -LiteralPath $backup.FullName -Destination $transferred
   (Get-FileHash -Algorithm SHA256 -LiteralPath $backup.FullName).Hash
   (Get-FileHash -Algorithm SHA256 -LiteralPath $transferred).Hash
   ```

4. Abrir un perfil completamente nuevo:

   ```powershell
   $env:OPTICA_QA_USER_DATA_PATH = $qaTarget
   npm run dev
   ```

5. Crear una contraseña de acceso local nueva y distinta. No copiar `security.json`,
   `backup-credential.json` ni configuraciones desde el perfil fuente.
6. En Restauración, elegir `$transferred`. Probar primero una contraseña incorrecta: debe rechazarse
   sin reiniciar ni cambiar la base actual. Luego ingresar la contraseña de recuperación correcta,
   verificar fecha y versión, leer la advertencia y confirmar.
7. Después del reinicio, ingresar con la contraseña de acceso **del perfil nuevo**. Comprobar el
   cliente, receta y revisión, graduaciones, ficha, producto, tratamientos y comprobante, incluidos
   sus IDs y relaciones. Si el lanzador de desarrollo no vuelve a abrir la ventana automáticamente,
   ejecutar otra vez `npm run dev` conservando `$env:OPTICA_QA_USER_DATA_PATH = $qaTarget`.
8. Confirmar que el modo automático y el destino externo requieren nueva configuración. Esto evita
   trasladar una credencial DPAPI o una ruta que sólo existía en la computadora anterior.
9. Para probar daño, cerrar Occhiali y truncar únicamente una copia adicional:

   ```powershell
   $damaged = Join-Path $qaExchange 'damaged-copy.ocbackup'
   Copy-Item -LiteralPath $transferred -Destination $damaged
   $bytes = [IO.File]::ReadAllBytes($damaged)
   if ($bytes.Length -lt 2) { throw 'La copia QA es demasiado pequeña para truncarla.' }
   [byte[]]$truncated = $bytes[0..([Math]::Floor($bytes.Length / 2) - 1)]
   [IO.File]::WriteAllBytes($damaged, $truncated)
   ```

   Reabrir el perfil destino, seleccionar `damaged-copy.ocbackup` y verificar que se rechaza. La
   información restaurada previamente debe permanecer intacta.

10. Para observar exclusión mutua sin tocar archivos, activar el modo automático en el perfil
    destino con una hora ya vencida y comenzar una restauración válida. Mientras la restauración
    está en curso no debe aparecer una segunda creación ni un reintento; después del reinicio, el
    scheduler vuelve a evaluar su estado normal.

Al finalizar, cerrar Electron y eliminar exclusivamente estas rutas temporales:

```powershell
$qaFull = [IO.Path]::GetFullPath($qaBase)
$tempFull = [IO.Path]::GetFullPath([IO.Path]::GetTempPath()).TrimEnd('\')
$qaParent = [IO.Path]::GetDirectoryName($qaFull).TrimEnd('\')
$qaLeaf = [IO.Path]::GetFileName($qaFull)
if (
  -not $qaParent.Equals($tempFull, [StringComparison]::OrdinalIgnoreCase) -or
  -not $qaLeaf.StartsWith('occhiali-dr-qa-', [StringComparison]::OrdinalIgnoreCase)
) {
  throw 'Se rechazó la limpieza fuera de TEMP.'
}
Remove-Item Env:OPTICA_QA_USER_DATA_PATH -ErrorAction SilentlyContinue
Remove-Item -LiteralPath $qaFull -Recurse -Force
```

## Límites y respuesta ante fallos

- Sin la contraseña de recuperación no es posible descifrar el archivo.
- Una verificación local no confirma que un proveedor de nube haya subido la copia.
- Si aparece `recovery-required`, no borrar ni renombrar la base, rollback o marcador. Cerrar la
  aplicación, conservar el perfil completo y solicitar revisión técnica.
- Conservar al menos una copia verificada fuera de la computadora y la contraseña en un medio
  separado.
