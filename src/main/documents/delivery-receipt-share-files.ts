import { createHash } from 'node:crypto';
import { lstat, mkdtemp, readFile, readdir, rmdir, unlink, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { DeliveryReceipt } from '../../shared/database-models';
import type { PreparedDeliveryReceiptPdf } from './delivery-receipt-pdf';

export const DELIVERY_RECEIPT_SHARE_DIRECTORY_PREFIX = 'Occhiali-WhatsApp-';
export const DELIVERY_RECEIPT_SHARE_MAX_AGE_MS = 24 * 60 * 60 * 1_000;
export const DELIVERY_RECEIPT_SHARE_MARKER_FILE = '.occhiali-whatsapp-share';
export const DELIVERY_RECEIPT_SHARE_MARKER_CONTENT = 'occhiali-delivery-receipt-share-v1';

const DELIVERY_RECEIPT_SHARE_FILE_PATTERN = /^Occhiali-Retiro-[A-Za-z0-9_-]+\.pdf$/;

interface CachedSharePdf extends PreparedDeliveryReceiptPdf {
  receiptFingerprint: string;
  pdfFingerprint: string;
}

export interface DeliveryReceiptShareCleanupOptions {
  now?: number;
  preservePaths?: ReadonlySet<string>;
  unlinkFile?: (filePath: string) => Promise<void>;
}

function fingerprint(value: string | Buffer): string {
  return createHash('sha256').update(value).digest('hex');
}

async function isOwnedShareDirectory(directoryPath: string): Promise<boolean> {
  const markerPath = join(directoryPath, DELIVERY_RECEIPT_SHARE_MARKER_FILE);
  try {
    const details = await lstat(markerPath);
    return (
      details.isFile() &&
      !details.isSymbolicLink() &&
      (await readFile(markerPath, 'utf8')) === DELIVERY_RECEIPT_SHARE_MARKER_CONTENT
    );
  } catch {
    return false;
  }
}

/**
 * At preparation time, removes only PDFs older than 24 hours with the exact Occhiali share naming
 * convention, inside direct child directories that also carry Occhiali's ownership marker.
 * Unknown files, links and recent/current PDFs are never removed. Cleanup is best-effort so a
 * Windows permission error cannot block sharing.
 */
export async function cleanupOldDeliveryReceiptShareFiles(
  temporaryRoot: string,
  options: DeliveryReceiptShareCleanupOptions = {},
): Promise<void> {
  const now = options.now ?? Date.now();
  const preservePaths = options.preservePaths ?? new Set<string>();
  const unlinkFile = options.unlinkFile ?? unlink;
  let directories;
  try {
    directories = await readdir(temporaryRoot, { withFileTypes: true });
  } catch {
    return;
  }

  for (const directory of directories) {
    if (
      !directory.name.startsWith(DELIVERY_RECEIPT_SHARE_DIRECTORY_PREFIX) ||
      !directory.isDirectory() ||
      directory.isSymbolicLink()
    )
      continue;
    const directoryPath = join(temporaryRoot, directory.name);
    if (!(await isOwnedShareDirectory(directoryPath))) continue;
    let files;
    try {
      files = await readdir(directoryPath, { withFileTypes: true });
    } catch {
      continue;
    }

    for (const file of files) {
      if (
        !file.isFile() ||
        file.isSymbolicLink() ||
        !DELIVERY_RECEIPT_SHARE_FILE_PATTERN.test(file.name)
      )
        continue;
      const filePath = join(directoryPath, file.name);
      if (preservePaths.has(filePath)) continue;
      try {
        const details = await lstat(filePath);
        if (
          details.isFile() &&
          !details.isSymbolicLink() &&
          details.mtimeMs <= now - DELIVERY_RECEIPT_SHARE_MAX_AGE_MS
        )
          await unlinkFile(filePath);
      } catch {
        // Best-effort cleanup: sharing must continue when Windows locks or denies a file.
      }
    }

    try {
      const remaining = await readdir(directoryPath);
      if (remaining.length === 1 && remaining[0] === DELIVERY_RECEIPT_SHARE_MARKER_FILE) {
        const markerPath = join(directoryPath, DELIVERY_RECEIPT_SHARE_MARKER_FILE);
        const marker = await lstat(markerPath);
        if (marker.mtimeMs <= now - DELIVERY_RECEIPT_SHARE_MAX_AGE_MS) {
          await unlink(markerPath);
          await rmdir(directoryPath);
        }
      }
    } catch {
      // The directory is in use, not empty or no longer accessible. Leave it untouched.
    }
  }
}

export class DeliveryReceiptShareFileStore {
  private readonly cache = new Map<number, CachedSharePdf>();

  public constructor(private readonly temporaryRoot: string) {}

  public async getOrCreate(
    receipt: DeliveryReceipt,
    render: () => Promise<Buffer>,
  ): Promise<PreparedDeliveryReceiptPdf> {
    await cleanupOldDeliveryReceiptShareFiles(this.temporaryRoot, {
      preservePaths: new Set([...this.cache.values()].map((entry) => entry.filePath)),
    });

    const receiptFingerprint = fingerprint(JSON.stringify(receipt));
    const cached = this.cache.get(receipt.id);
    if (cached?.receiptFingerprint === receiptFingerprint && (await this.isReusable(cached)))
      return { filePath: cached.filePath, fileName: cached.fileName };

    const pdf = await render();
    const directory = await mkdtemp(
      join(this.temporaryRoot, DELIVERY_RECEIPT_SHARE_DIRECTORY_PREFIX),
    );
    await writeFile(
      join(directory, DELIVERY_RECEIPT_SHARE_MARKER_FILE),
      DELIVERY_RECEIPT_SHARE_MARKER_CONTENT,
      { flag: 'wx' },
    );
    const safeNumber = receipt.receiptNumber.replace(/[^A-Za-z0-9_-]/g, '_');
    const fileName = `Occhiali-Retiro-${safeNumber}.pdf`;
    const filePath = join(directory, fileName);
    await writeFile(filePath, pdf, { flag: 'wx' });
    this.cache.set(receipt.id, {
      filePath,
      fileName,
      receiptFingerprint,
      pdfFingerprint: fingerprint(pdf),
    });
    return { filePath, fileName };
  }

  private async isReusable(cached: CachedSharePdf): Promise<boolean> {
    if (
      dirname(cached.filePath) === this.temporaryRoot ||
      !dirname(cached.filePath).startsWith(
        join(this.temporaryRoot, DELIVERY_RECEIPT_SHARE_DIRECTORY_PREFIX),
      )
    )
      return false;
    try {
      const details = await lstat(cached.filePath);
      if (!details.isFile() || details.isSymbolicLink()) return false;
      return fingerprint(await readFile(cached.filePath)) === cached.pdfFingerprint;
    } catch {
      return false;
    }
  }
}
