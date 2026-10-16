# Manual de usuario

Este manual describe el uso cotidiano de Occhiali 0.9.0. La aplicación funciona de manera local y
sin conexión a internet. Los datos se guardan en la computadora donde está instalada.

## Tareas cotidianas

### Abrir Occhiali e iniciar sesión

1. Abrí **Occhiali** desde el Escritorio o el menú Inicio.
2. En el primer uso, creá una contraseña de acceso de al menos 10 caracteres y repetila.
3. En los usos siguientes, escribí esa contraseña y elegí **Ingresar**.

La contraseña bloquea el acceso desde la aplicación, pero no cifra por sí sola el archivo de datos.
Al terminar o alejarte del equipo, usá **Configuración > Bloquear ahora** y protegé también la
sesión de Windows.

### Registrar un cliente

1. Entrá en **Clientes**.
2. Elegí **Nuevo cliente**.
3. Completá nombre y apellido. DNI, teléfono, domicilio, fecha de nacimiento y notas son opcionales.
4. Revisá los datos y elegí **Guardar cliente**.

El DNI no puede repetirse. Si la persona ya existe, buscala antes de crear otra ficha.

### Buscar, consultar y editar clientes

- En **Clientes**, buscá por nombre, apellido, DNI o teléfono.
- Usá los filtros **Activos**, **Archivados** y **Todos**.
- Elegí **Ver ficha** para consultar recetas y trabajos relacionados.
- Dentro de la ficha, elegí **Editar** para corregir los datos generales.

Archivar oculta al cliente de las operaciones nuevas, pero conserva su historial. Desde el filtro de
archivados se lo puede reactivar con el mismo ID.

### Registrar una receta

Podés iniciar el alta desde la ficha del cliente o desde **Recetas > Nueva receta**. En el alta
general, escribí al menos dos caracteres del nombre, apellido, DNI o teléfono y seleccioná el
cliente correcto.

1. Indicá la fecha de prescripción.
2. Completá solamente los valores informados para lejos/cerca y ojo derecho/izquierdo.
3. Agregá profesional y notas si corresponde.
4. Elegí **Guardar receta**.

Los campos ópticos vacíos significan “no informado”; no deben completarse con valores supuestos.

### Consultar historial y corregir una receta

La ficha del cliente y el detalle de la receta muestran su historial. Si una receta contiene un
error de carga, usá **Corregir receta**, indicá el motivo y guardá los valores correctos. Occhiali
mantiene el mismo ID y conserva la versión anterior como revisión trazable.

No uses una corrección para reemplazar una prescripción nueva: una receta posterior debe registrarse
como un nuevo registro.

### Crear y editar una ficha óptica

1. Entrá en **Trabajos > Nueva ficha** o iniciá desde un cliente.
2. Seleccioná el cliente.
3. Asociá, si corresponde, una receta del mismo cliente.
4. Completá número de ficha y producto. Podés elegir la sugerencia **Lentes de contacto** o escribir
   cualquier otro producto.
5. Si corresponde, cargá el color del producto, proveedor, armazón y modelo. El color del producto
   es distinto de la coloración de los lentes.
6. Escribí uno o varios tratamientos o acabados, uno por línea o separados por comas.
7. Completá la coloración de los lentes y las observaciones necesarias.
8. Guardá la ficha.

Los tratamientos son características comerciales de lentes, no procedimientos médicos. Desde el
detalle puede editarse la ficha y consultarse su relación con cliente y receta.

### Dashboard y búsqueda global

**Inicio** muestra los conteos reales de clientes activos, recetas y fichas. La búsqueda superior
consulta los tres módulos. Podés enfocarla con `Ctrl+K`, escribir al menos dos caracteres y abrir el
resultado. `Esc` cierra los resultados.

### Cerrar el programa

Terminá cualquier guardado o respaldo en curso. Cerrá la ventana con el botón habitual de Windows.
La próxima apertura volverá a solicitar la contraseña.

## Operaciones delicadas

### Crear y exportar un respaldo

1. Entrá en **Configuración**.
2. Escribí una contraseña de recuperación de al menos 12 caracteres.
3. Elegí **Crear copia ahora**.
4. Confirmá que Occhiali informe que la copia local fue cifrada y verificada.
5. Opcionalmente, elegí una carpeta sincronizada para depositar una copia adicional.

Guardá la contraseña de recuperación fuera de la computadora. Occhiali no la almacena y no puede
recuperar un respaldo si se pierde. Depositar el archivo en una carpeta sincronizada no confirma que
el servicio remoto haya terminado de subirlo.

### Verificar un respaldo

1. En **Configuración > Restauración**, elegí **Seleccionar respaldo**.
2. Seleccioná un archivo `.ocbackup`.
3. Escribí su contraseña de recuperación.
4. Elegí **Verificar** y revisá fecha y versión informadas.

Verificar no reemplaza la base activa.

### Restaurar información

La restauración reemplaza la base activa por el contenido del respaldo. Hacela sólo cuando sea
necesario y después de verificar el archivo.

1. Cerrá otras instancias de Occhiali.
2. Seleccioná y verificá el respaldo.
3. Elegí **Restaurar respaldo** y confirmá la advertencia.
4. No apagues ni fuerces el cierre durante la operación.
5. Esperá el reinicio y comprobá clientes, recetas y fichas.

Antes de reemplazar datos, Occhiali crea una copia preventiva cifrada. Si aparece un mensaje de
recuperación requerida, no repitas la restauración ni borres archivos: cerrá el programa y seguí el
procedimiento de soporte.

## Recomendaciones

- Activá BitLocker o Cifrado de dispositivo de Windows.
- Conservá respaldos verificados en más de un dispositivo.
- No compartas contraseñas por mensajes inseguros ni las guardes junto al `.ocbackup`.
- No edites, renombres parcialmente ni abras la base SQLite con herramientas externas.
- No copies sólo `optica.sqlite3` mientras Occhiali está abierto; usá el respaldo incorporado.
