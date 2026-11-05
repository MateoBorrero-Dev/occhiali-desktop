import { shell } from 'electron';
import type { DeliveryReceipt, DeliveryReceiptWhatsAppResult } from '../../shared/database-models';
import type { WhatsAppShareInput } from '../../shared/whatsapp-validation';
import {
  assertAuthorizedWhatsAppUrl,
  buildWhatsAppUrl,
  parseWhatsAppShareInput,
} from '../../shared/whatsapp-validation';
import type { DeliveryReceiptPdfPreparer } from './delivery-receipt-pdf';

export class DeliveryReceiptSharePdfError extends Error {
  public constructor() {
    super('No se pudo preparar el PDF para compartir.');
    this.name = 'DeliveryReceiptSharePdfError';
  }
}

export class DeliveryReceiptWhatsAppOpenError extends Error {
  public constructor() {
    super('El PDF quedó preparado, pero no se pudo abrir WhatsApp.');
    this.name = 'DeliveryReceiptWhatsAppOpenError';
  }
}

export interface WhatsAppExternalGateway {
  revealFile(filePath: string): void;
  open(url: string): Promise<void>;
}

export class ElectronWhatsAppExternalGateway implements WhatsAppExternalGateway {
  public revealFile(filePath: string): void {
    shell.showItemInFolder(filePath);
  }

  public async open(url: string): Promise<void> {
    const authorized = assertAuthorizedWhatsAppUrl(url);
    await shell.openExternal(authorized.toString());
  }
}

export class DeliveryReceiptWhatsAppService {
  public constructor(
    private readonly pdf: DeliveryReceiptPdfPreparer,
    private readonly external: WhatsAppExternalGateway,
  ) {}

  public async prepare(
    receipt: DeliveryReceipt,
    input: WhatsAppShareInput,
  ): Promise<DeliveryReceiptWhatsAppResult> {
    const normalized = parseWhatsAppShareInput(input);
    let prepared;
    try {
      prepared = await this.pdf.prepareForShare(receipt);
    } catch {
      throw new DeliveryReceiptSharePdfError();
    }

    const url = buildWhatsAppUrl(normalized);
    try {
      this.external.revealFile(prepared.filePath);
      await this.external.open(url);
    } catch {
      throw new DeliveryReceiptWhatsAppOpenError();
    }
    return { fileName: prepared.fileName, normalizedPhone: normalized.phone };
  }
}
