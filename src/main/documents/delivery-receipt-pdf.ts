import { BrowserWindow, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { DeliveryReceipt, DeliveryReceiptExportResult } from '../../shared/database-models';
import { renderDeliveryReceiptHtml } from './delivery-receipt-document';

export interface DeliveryReceiptPdfExporter {
  export(receipt: DeliveryReceipt): Promise<DeliveryReceiptExportResult>;
}

export class ElectronDeliveryReceiptPdfExporter implements DeliveryReceiptPdfExporter {
  public async export(receipt: DeliveryReceipt): Promise<DeliveryReceiptExportResult> {
    const suggested = `Occhiali-Retiro-${receipt.receiptNumber}.pdf`;
    const selected = await dialog.showSaveDialog({
      title: 'Exportar comprobante de retiro',
      defaultPath: suggested,
      buttonLabel: 'Exportar PDF',
      filters: [{ name: 'Documento PDF', extensions: ['pdf'] }],
      properties: ['showOverwriteConfirmation', 'createDirectory'],
    });
    if (selected.canceled || !selected.filePath) return { canceled: true, fileName: null };
    const destination =
      extname(selected.filePath).toLowerCase() === '.pdf'
        ? selected.filePath
        : `${selected.filePath}.pdf`;
    const preview = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    try {
      preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      preview.webContents.on('will-navigate', (event) => event.preventDefault());
      const html = renderDeliveryReceiptHtml(receipt);
      await preview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      const pdf = await preview.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: true,
      });
      await writeFile(destination, pdf, { flag: 'w' });
      return { canceled: false, fileName: basename(destination) };
    } finally {
      if (!preview.isDestroyed()) preview.destroy();
    }
  }
}
