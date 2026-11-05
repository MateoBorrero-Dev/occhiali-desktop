import { app, BrowserWindow, dialog } from 'electron';
import { writeFile } from 'node:fs/promises';
import { basename, extname } from 'node:path';
import type { DeliveryReceipt, DeliveryReceiptExportResult } from '../../shared/database-models';
import { renderDeliveryReceiptHtml } from './delivery-receipt-document';
import { DeliveryReceiptShareFileStore } from './delivery-receipt-share-files';

export interface DeliveryReceiptPdfExporter {
  export(receipt: DeliveryReceipt): Promise<DeliveryReceiptExportResult>;
}

export interface PreparedDeliveryReceiptPdf {
  filePath: string;
  fileName: string;
}

export interface DeliveryReceiptPdfPreparer {
  prepareForShare(receipt: DeliveryReceipt): Promise<PreparedDeliveryReceiptPdf>;
}

export class ElectronDeliveryReceiptPdfExporter
  implements DeliveryReceiptPdfExporter, DeliveryReceiptPdfPreparer
{
  private shareFiles: DeliveryReceiptShareFileStore | null = null;

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
    const pdf = await this.render(receipt);
    await writeFile(destination, pdf, { flag: 'w' });
    return { canceled: false, fileName: basename(destination) };
  }

  public async prepareForShare(receipt: DeliveryReceipt): Promise<PreparedDeliveryReceiptPdf> {
    this.shareFiles ??= new DeliveryReceiptShareFileStore(app.getPath('temp'));
    return this.shareFiles.getOrCreate(receipt, () => this.render(receipt));
  }

  private async render(receipt: DeliveryReceipt): Promise<Buffer> {
    const preview = new BrowserWindow({
      show: false,
      webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
    });
    try {
      preview.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
      preview.webContents.on('will-navigate', (event) => event.preventDefault());
      const html = renderDeliveryReceiptHtml(receipt);
      await preview.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
      return await preview.webContents.printToPDF({
        printBackground: true,
        pageSize: 'A4',
        preferCSSPageSize: true,
      });
    } finally {
      if (!preview.isDestroyed()) preview.destroy();
    }
  }
}
