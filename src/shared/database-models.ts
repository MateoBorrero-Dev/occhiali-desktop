export type CalendarDate = string;
export type IsoTimestamp = string;
export type DecimalValue = string;

export interface Client {
  id: number;
  firstName: string;
  lastName: string;
  documentNumber: string | null;
  phone: string | null;
  address: string | null;
  birthDate: CalendarDate | null;
  notes: string | null;
  isArchived: boolean;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface CreateClientInput {
  firstName: string;
  lastName: string;
  documentNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  birthDate?: CalendarDate | null;
  notes?: string | null;
}

export interface UpdateClientInput {
  firstName?: string;
  lastName?: string;
  documentNumber?: string | null;
  phone?: string | null;
  address?: string | null;
  birthDate?: CalendarDate | null;
  notes?: string | null;
  isArchived?: boolean;
}

export type PrescriptionDistance = 'FAR' | 'NEAR';
export type Eye = 'OD' | 'OI';

export interface PrescriptionValue {
  id: number;
  prescriptionId: number;
  distance: PrescriptionDistance;
  eye: Eye;
  sphere: DecimalValue | null;
  cylinder: DecimalValue | null;
  axis: number | null;
  dip: DecimalValue | null;
  height: DecimalValue | null;
}

export interface CreatePrescriptionValueInput {
  distance: PrescriptionDistance;
  eye: Eye;
  sphere?: DecimalValue | null;
  cylinder?: DecimalValue | null;
  axis?: number | null;
  dip?: DecimalValue | null;
  height?: DecimalValue | null;
}

export interface Prescription {
  id: number;
  clientId: number;
  prescriptionDate: CalendarDate;
  prescriberName: string | null;
  notes: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  values: PrescriptionValue[];
}

export interface CreatePrescriptionInput {
  clientId: number;
  prescriptionDate: CalendarDate;
  prescriberName?: string | null;
  notes?: string | null;
  values?: CreatePrescriptionValueInput[];
}

export type FrameCondition = 'NEW' | 'USED';
export type FrameMaterial = 'ZILO' | 'METAL';
export type ColorType = 'FULL' | 'GRADIENT';

export interface OpticalJob {
  id: number;
  clientId: number;
  prescriptionId: number | null;
  jobNumber: string | null;
  product: string | null;
  frameCondition: FrameCondition | null;
  frameMaterial: FrameMaterial | null;
  frameModel: string | null;
  colorType: ColorType | null;
  observations: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  treatments: Treatment[];
}

export interface CreateOpticalJobInput {
  clientId: number;
  prescriptionId?: number | null;
  jobNumber?: string | null;
  product?: string | null;
  frameCondition?: FrameCondition | null;
  frameMaterial?: FrameMaterial | null;
  frameModel?: string | null;
  colorType?: ColorType | null;
  observations?: string | null;
  treatmentIds?: string[];
}

export interface Treatment {
  id: string;
  name: string;
  isActive: boolean;
  createdAt: IsoTimestamp;
}

export interface OpticalJobTreatment {
  opticalJobId: number;
  treatmentId: string;
  createdAt: IsoTimestamp;
}
