# Manual de usuario — Occhiali 1.2.0

Occhiali es una aplicación de escritorio para organizar la actividad cotidiana de una óptica. Funciona
de manera local y sin conexión a internet. Los datos se guardan en la computadora donde está instalada.

## 1. Abrir Occhiali e iniciar sesión

1. Abrí **Occhiali** desde el Escritorio o el menú Inicio.
2. En el primer uso, creá una contraseña de acceso de al menos 10 caracteres y repetila.
3. En los usos siguientes, escribí esa contraseña y elegí **Ingresar**.

La contraseña limita el acceso desde la aplicación, pero no cifra por sí sola el archivo de datos. Al
terminar o alejarte del equipo, usá **Configuración > Bloquear ahora** y protegé también la sesión de
Windows.

## 2. Navegación, Inicio y búsqueda global

El menú lateral reúne **Inicio**, **Clientes**, **Fichas ópticas**, **Retiros** y **Configuración**.

**Inicio** muestra indicadores reales de clientes activos, recetas y fichas. La búsqueda superior permite
buscar clientes, recetas y fichas por los datos disponibles. Podés enfocarla con `Ctrl+K`, escribir al
menos dos caracteres y abrir un resultado. `Esc` cierra los resultados.

## 3. Registrar un cliente

1. Entrá en **Clientes**.
2. Elegí **Nuevo cliente**.
3. Completá nombre y apellido. DNI, teléfono, domicilio, fecha de nacimiento y notas son opcionales.
4. Revisá los datos y elegí **Guardar cliente**.

El DNI no puede repetirse. Si la persona ya existe, buscala antes de crear otra ficha.

## 4. Buscar, consultar y editar clientes

- En **Clientes**, buscá por nombre, apellido, DNI o teléfono.
- Usá los filtros **Activos**, **Archivados** y **Todos**.
- Elegí **Ver ficha** para consultar su información e historial relacionado.
- Dentro de la ficha, elegí **Editar** para corregir los datos generales.

Archivar impide nuevas altas para ese cliente, pero conserva su historial. Desde el filtro de archivados se
lo puede reactivar con el mismo identificador.

## 5. Crear una ficha óptica

Entrá en **Fichas ópticas** y elegí **Nueva ficha**, o iniciá el alta desde la ficha del cliente. La nueva
pantalla reúne la receta, la graduación y la información comercial en una sola operación.

1. Seleccioná el cliente correcto.
2. Indicá la fecha y, si corresponde, el **Profesional**.
3. Ingresá manualmente el número de ficha. Si se informa, debe ser único.
4. Completá las graduaciones de **LEJOS** y **CERCA** para OD y OI. Cada bloque dispone de ESF, CIL, EJE,
   DIP y ALT.
5. Elegí el producto: **Anteojos de receta**, **Lentes de sol**, **Lentes de contacto** u **Otro**. Con
   **Otro**, escribí el nombre del producto.
6. Completá, cuando corresponda, cristal, marca, color y coloración.
7. Escribí uno o varios tratamientos separados por comas o saltos de línea.
8. En **Armazón**, indicá condición, material, modelo y proveedor.
9. Agregá las observaciones generales al final.
10. Revisá todo y elegí **Guardar ficha**.

Los campos ópticos vacíos significan “no informado”; no los completes con valores supuestos. `0,00` sí es
un valor informado y es distinto de dejar el campo vacío. Occhiali no calcula graduaciones. Los valores
históricos de adición se conservan en la base, aunque ADD ya no forma parte de la interfaz 1.2.0.

El guardado es conjunto: si una parte no puede guardarse, Occhiali revierte toda la operación para evitar
una receta o un trabajo incompletos.

## 6. Consultar y editar una ficha

El listado de **Fichas ópticas** permite buscar y recorrer los registros existentes. El detalle reúne datos
del cliente, información comercial, armazón, observaciones, graduación, tratamientos, revisiones y retiro.
Los campos opcionales sin datos permanecen vacíos.

Elegí **Editar ficha completa** para modificar la ficha en el mismo orden utilizado al crearla. Existe un
único botón **Guardar cambios**. Los cambios comerciales y ópticos se guardan de manera atómica.

Cuando cambia la graduación, se solicita un motivo y se crea una revisión histórica. Si no cambia la
graduación, no se crea una revisión innecesaria. Las observaciones generales nuevas pertenecen a la ficha;
las notas históricas anteriores se conservan para consulta.

## 7. Graduaciones compartidas e historial

Una receta histórica puede estar asociada con más de una ficha. Antes de cambiar una graduación compartida,
Occhiali muestra una advertencia y exige una confirmación explícita, porque el cambio será visible en todas
las fichas vinculadas. No elijas una ficha arbitrariamente ni continúes si no corresponde corregirlas a
todas.

Las recetas históricas que no tienen trabajo asociado conservan su mecanismo de corrección. Las revisiones
mantienen los valores anteriores, el motivo, la fecha y la trazabilidad.

## 8. Tratamientos y datos comerciales

Los tratamientos son características o acabados comerciales de lentes, no procedimientos médicos. Podés
escribir tratamientos existentes o personalizados. Occhiali normaliza espacios y evita duplicados sin
eliminar el catálogo ni los datos históricos.

Cristal, marca, modelo, color, coloración, proveedor y armazón son datos independientes. No uses un campo
para guardar información que corresponde a otro.

## 9. Registrar un retiro

1. Abrí el detalle de una ficha y elegí **Registrar retiro**.
2. Confirmá fecha y hora, quién retira y quién realiza la entrega.
3. Si retira un tercero, ingresá DNI, vínculo y referencia de autorización, y marcá la comprobación
   realizada. Occhiali no verifica documentos automáticamente.
4. Elegí **Revisar entrega**, controlá el resumen y confirmá expresamente la entrega.

El comprobante toma una copia histórica de los datos comerciales: editar luego la ficha no modifica el
documento ya emitido. El comprobante es un registro digital de entrega, no contiene espacios de firma y
**no es factura ni comprobante fiscal**.

## 10. Consultar Retiros

Entrá en **Retiros** para consultar comprobantes existentes. Podés buscar por cliente, número de comprobante
o número de ficha, y filtrar por estado y fechas. El listado está ordenado desde el más reciente y conserva
los filtros y la página al entrar a un detalle y regresar.

## 11. Aclaraciones y anulaciones

Una aclaración agrega información sin alterar el registro original. Una anulación exige un motivo, cambia
el estado visible y también conserva el comprobante original. Estas acciones se agregan al historial: no
borran ni reescriben eventos anteriores.

## 12. Exportar un comprobante PDF

Desde el detalle del retiro elegí **Exportar PDF** y seleccioná dónde guardarlo. El PDF utiliza el mismo
diseño digital que la vista de Occhiali y conserva los datos, el estado y la advertencia fiscal. Cancelar el
diálogo no crea otro retiro.

## 13. Compartir por WhatsApp

El envío por WhatsApp es asistido; Occhiali no envía archivos ni mensajes por sí solo.

1. En el comprobante, revisá o corregí el teléfono y el mensaje.
2. Confirmá que verificaste al destinatario. Si cambiás el teléfono o el mensaje, deberás confirmar otra
   vez.
3. Elegí la acción para preparar el comprobante y abrir WhatsApp.
4. En WhatsApp, adjuntá manualmente el PDF indicado por Occhiali.
5. Revisá destinatario, mensaje y archivo, y confirmá el envío manualmente.

Occhiali abre solamente el enlace permitido de WhatsApp y mantiene disponible el PDF temporal para que
puedas adjuntarlo. La aplicación no puede confirmar que el mensaje haya sido enviado o recibido.

## 14. Seguridad de acceso

En **Configuración** podés cambiar la contraseña, ajustar el bloqueo por inactividad y usar **Bloquear
ahora**. Conservá la contraseña de acceso en un lugar seguro. Es distinta de la contraseña de recuperación
de respaldos.

## 15. Crear un respaldo manual

1. Entrá en **Configuración > Respaldos**.
2. Escribí una contraseña de recuperación de al menos 12 caracteres.
3. Elegí **Crear copia ahora**.
4. Confirmá que Occhiali informe que la copia local fue cifrada y verificada.
5. Opcionalmente, configurá una carpeta externa y comprobá el resultado por separado.

Guardá la contraseña de recuperación fuera de la computadora. Sin un respaldo válido y esa contraseña no
es posible recuperar la información. Una copia externa en una carpeta sincronizada no confirma que el
servicio remoto ya la haya subido a internet.

## 16. Configurar respaldos automáticos

En **Configuración > Respaldos** podés conservar el modo asistido o activar el modo automático mediante una
decisión explícita. Para el modo automático, primero guardá una contraseña de recuperación protegida por
Windows y conservá otra copia fuera de la computadora.

Elegí una hora y guardá la programación. La copia pendiente se realiza cuando Occhiali está abierto,
incluso al iniciar después del horario o al reanudar Windows. Si la aplicación está cerrada, no se ejecutan
respaldos. Occhiali evita duplicados para una ventana ya cubierta.

Si la carpeta externa no está disponible, el respaldo local sigue siendo válido y la interfaz muestra la
copia externa pendiente. Los reintentos usan el mismo archivo local; no crean copias locales innecesarias.
La verificación de la copia externa comprueba el archivo en esa carpeta, no una sincronización en la nube.

La retención se aplica únicamente a respaldos locales propios reconocidos. Occhiali no elimina archivos
ajenos ni copias de la carpeta externa.

## 17. Verificar un respaldo

1. En **Configuración > Restauración**, elegí **Seleccionar respaldo**.
2. Seleccioná un archivo `.ocbackup`.
3. Escribí su contraseña de recuperación.
4. Elegí **Verificar** y revisá la fecha y la versión informadas.

Verificar no reemplaza la base activa.

## 18. Restaurar información

> **Advertencia:** restaurar reemplaza la base activa con el contenido del respaldo. Los cambios posteriores
> a esa copia dejan de estar visibles.

1. Cerrá otras instancias de Occhiali.
2. Seleccioná y verificá el respaldo.
3. Elegí **Restaurar respaldo** y confirmá la advertencia.
4. No apagues ni fuerces el cierre durante la operación.
5. Esperá el reinicio y comprobá clientes, fichas y retiros.

Antes de reemplazar datos, Occhiali crea una copia preventiva cifrada. Si aparece un mensaje de recuperación
requerida, no repitas la restauración ni borres archivos: cerrá el programa y seguí el procedimiento de
soporte.

En una computadora nueva, creá primero una contraseña de acceso local nueva. Luego restaurá el `.ocbackup`
usando su contraseña de recuperación; no necesitás la cuenta de Windows ni la credencial protegida del
equipo anterior. La base recupera la información comercial, pero no traslada la contraseña de acceso, la
programación automática, la carpeta externa, el historial de respaldos ni los PDF exportados.

## 19. Actualizar desde 1.1.0 y volver a una versión anterior

Antes de actualizar, creá y verificá un respaldo compatible de 1.1.0 y conservá una copia fuera del equipo.
La instalación 1.2.0 mantiene la misma identidad y carpeta de datos, y aplica las migraciones pendientes al
abrir la base.

> **Importante:** después de aplicar la migración 007, esa base no puede abrirse directamente con Occhiali
> 1.1.0. Para volver a 1.1.0 se debe restaurar, desde esa versión, un respaldo compatible creado antes de la
> migración. No intentes forzar un downgrade ni editar la base manualmente.

## 20. Recomendaciones y cierre

- Activá BitLocker o Cifrado de dispositivo de Windows.
- Conservá respaldos verificados en más de un dispositivo.
- No compartas contraseñas por medios inseguros ni las guardes junto al `.ocbackup`.
- No edites la base SQLite con herramientas externas ni copies solo `optica.sqlite3` con Occhiali abierto.
- Terminá cualquier guardado o respaldo antes de cerrar la ventana.
- Recordá que Occhiali funciona offline; WhatsApp y una carpeta sincronizada dependen de servicios externos.
