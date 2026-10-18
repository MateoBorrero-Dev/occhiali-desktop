# Comprobantes de retiro

## Alcance

Cada ficha óptica admite una única entrega completa. Desde su detalle, **Registrar retiro** abre un
formulario con fecha y hora efectivas, persona que retira, responsable de entrega y observaciones.
Antes de guardar se muestra un resumen y se exige confirmar expresamente que el producto fue
entregado. Abrir la vista previa o exportar un PDF nunca registra una entrega.

El comprobante es una constancia comercial de entrega. No es factura, comprobante fiscal, firma
digital, venta, cobro ni movimiento de stock.

## Titular y tercero autorizado

Para el titular se precargan nombre y DNI existentes. Los cambios realizados allí describen a la
persona que efectivamente retira y no modifican el cliente. Para un tercero son obligatorios nombre,
DNI, vínculo, referencia de autorización y una declaración de la usuaria de que comprobó identidad
y autorización. Occhiali registra esa declaración; no verifica documentos ni conserva copias.

## Persistencia y numeración

La migración `006_delivery_receipts` agrega:

- `delivery_receipt_sequence`, cuya actualización atómica reserva números `RET-000001` sucesivos;
- `delivery_receipts`, con una restricción única por ficha y snapshot del cliente, producto y
  tratamientos;
- `delivery_receipt_events`, historial append-only de aclaraciones y anulaciones.

Los números no se basan en contar filas, no se reutilizan y permanecen asociados incluso si se
anula el comprobante. Una modificación posterior del cliente, ficha o tratamientos no altera el
snapshot. No se generan entregas ficticias para fichas anteriores.

## Aclaraciones y anulaciones

Un comprobante confirmado no se edita. **Registrar aclaración** agrega motivo y fecha sin tocar los
datos originales. **Anular comprobante** exige motivo, conserva el registro y cambia visiblemente su
estado. Un comprobante anulado no admite nuevos eventos ni una nueva entrega para la misma ficha.

## Vista previa y PDF

La vista usa una composición A4 con identidad de Occhiali, datos disponibles, declaración de
recepción y espacios para firmas manuscritas. **Exportar PDF** abre el diálogo nativo de Windows,
sugiere `Occhiali-Retiro-RET-000001.pdf` y permite cancelar sin crear archivos. Reexportar no crea un
nuevo comprobante.

Main escapa todo contenido antes de construir el HTML, crea una ventana oculta con sandbox,
`contextIsolation` y Node Integration deshabilitado, bloquea navegación y genera el documento con
`webContents.printToPDF`. No se usan servicios externos ni se devuelve la ruta elegida a React.

## Backup y limitaciones

Los comprobantes y eventos están dentro de SQLite, por lo que forman parte del backup cifrado y de
la restauración existentes. El alcance no contempla entregas parciales, varias entregas por ficha,
captura de firma, documentos adjuntos ni logística avanzada.
