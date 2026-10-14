# Exportación a carpeta sincronizada

## Funcionamiento

Fase 8 no integra Google Drive API, Microsoft Graph, OAuth ni servidores de Occhiali. La dueña
instala y configura Google Drive para escritorio u OneDrive por separado y selecciona su carpeta
local desde Configuración.

Después de verificar el backup local, Main lo copia a un nombre `.partial` dentro de esa carpeta y
lo renombra al nombre final cuando terminó. Esto evita presentar una copia incompleta como válida.
El archivo ya está cifrado y no contiene datos personales en el nombre.

Los estados tienen significado estricto:

- **Respaldo local creado:** el `.ocbackup` local se cifró y verificó.
- **Depositado en carpeta sincronizada:** la copia local en esa carpeta terminó.
- **Sincronización remota no verificada:** Occhiali no sabe si Drive/OneDrive la subió.
- **Error de exportación:** el backup local sigue siendo válido, pero no se pudo depositar la copia.

El nombre o ubicación de una carpeta no prueba que sea cloud. Occhiali no espera segundos ni muestra
“backup en la nube completado”. La usuaria debe consultar el cliente de sincronización y, de forma
periódica, verificar desde otra sesión o dispositivo que el archivo esté disponible.

## Uso offline y fallos

Sin internet siguen funcionando clientes, recetas, fichas, login, backups locales y restauraciones
locales. Drive u OneDrive sincronizará cuando vuelva la conexión según su propia configuración. Una
carpeta ausente o sin permisos produce un error de exportación comprensible y no invalida ni elimina
la copia local.

La contraseña de recuperación no se transmite ni se guarda en la carpeta. Perder el equipo y la
única copia de esa contraseña vuelve irrecuperables los backups; guardarla en otro medio autorizado
es parte del procedimiento operativo.
