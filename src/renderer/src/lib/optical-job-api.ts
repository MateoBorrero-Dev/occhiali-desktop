import type { OpticalJobIpcError, OpticalJobIpcResult } from '../../../shared/ipc-contracts';
import type { ColorType, FrameCondition, FrameMaterial } from '../../../shared/database-models';

export class OpticalJobRequestError extends Error {
  public constructor(public readonly detail: OpticalJobIpcError) {
    super(detail.message);
    this.name = 'OpticalJobRequestError';
  }
}

export function unwrapOpticalJobResult<T>(result: OpticalJobIpcResult<T>): T {
  if (!result.ok) throw new OpticalJobRequestError(result.error);
  return result.data;
}

const timestampFormatter = new Intl.DateTimeFormat('es-AR', {
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatJobTimestamp(value: string): string {
  return timestampFormatter.format(new Date(value));
}

export function frameConditionLabel(value: FrameCondition | null): string {
  if (value === 'NEW') return 'Nuevo';
  if (value === 'USED') return 'Usado';
  return 'Sin especificar';
}

export function frameMaterialLabel(value: FrameMaterial | null): string {
  if (value === 'ZILO') return 'Zilo';
  if (value === 'METAL') return 'Metal';
  return 'Sin especificar';
}

export function colorTypeLabel(value: ColorType | null): string {
  if (value === 'FULL') return 'Color pleno';
  if (value === 'GRADIENT') return 'Color degradé';
  return 'Sin especificar';
}
