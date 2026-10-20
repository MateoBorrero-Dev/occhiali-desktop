# Exportación a carpeta sincronizada

## Funcionamiento

Fase 8 no integra Google Drive API, Microsoft Graph, OAuth ni servidores de Occhiali. La dueña
instala y configura Google Drive para escritorio u OneDrive por separado y selecciona su carpeta
local desde Configuración.

Después de verificar el backup local, Main valida que la carpeta siga siendo un destino directo,
copia a un temporal exclusivo, fuerza su contenido a disco y compara tamaño y SHA-256. Sólo entonces
publica el nombre final. No recrea una carpeta que desapareció, no sigue symlinks o junctions y no
sobrescribe una copia diferente con el mismo nombre. El archivo ya está cifrado y no contiene datos
personales en el nombre.

Los estados tienen significado estricto:

- **Respaldo local creado:** el `.ocbackup` local se cifró y verificó.
- **Depositado en carpeta sincronizada:** la copia local en esa carpeta terminó.
- **Sincronización remota no verificada:** Occhiali no sabe si Drive/OneDrive la subió.
- **Error de exportación:** el backup local sigue siendo válido, pero no se pudo depositar la copia.
- **Copia externa pendiente:** se reutilizará el mismo respaldo local mediante reintentos acotados.

El nombre o ubicación de una carpeta no prueba que sea cloud. Occhiali no espera segundos ni muestra
“backup en la nube completado”. La usuaria debe consultar el cliente de sincronización y, de forma
periódica, verificar desde otra sesión o dispositivo que el archivo esté disponible.

## Uso offline y fallos

Sin internet siguen funcionando clientes, recetas, fichas, login, backups locales y restauraciones
locales. Drive u OneDrive sincronizará cuando vuelva la conexión según su propia configuración. Una
carpeta ausente o sin permisos produce un error de exportación comprensible y no invalida ni elimina
la copia local. Los detalles de verificación, reintentos y retención están en
[Copias externas robustas y retención segura](backup-resilience.md).

La contraseña de recuperación no se transmite ni se guarda en la carpeta. Perder el equipo y la
única copia de esa contraseña vuelve irrecuperables los backups; guardarla en otro medio autorizado
es parte del procedimiento operativo.
