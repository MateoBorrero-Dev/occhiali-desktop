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

export type ClientStatusFilter = 'active' | 'archived' | 'all';

export interface ClientListRequest {
  query?: string;
  status?: ClientStatusFilter;
  limit?: number;
  offset?: number;
}

export interface ClientListPage {
  items: Client[];
  total: number;
  limit: number;
  offset: number;
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
  additionOd: DecimalValue | null;
  additionOi: DecimalValue | null;
  notes: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  values: PrescriptionValue[];
}

export interface CreatePrescriptionInput {
  clientId: number;
  prescriptionDate: CalendarDate;
  prescriberName?: string | null;
  additionOd?: DecimalValue | null;
  additionOi?: DecimalValue | null;
  notes?: string | null;
  values?: CreatePrescriptionValueInput[];
}

export interface CorrectPrescriptionInput {
  prescriptionDate: CalendarDate;
  prescriberName?: string | null;
  additionOd?: DecimalValue | null;
  additionOi?: DecimalValue | null;
  notes?: string | null;
  values: CreatePrescriptionValueInput[];
  reason: string;
}

export interface PrescriptionSummary {
  id: number;
  clientId: number;
  clientFirstName: string;
  clientLastName: string;
  prescriptionDate: CalendarDate;
  prescriberName: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
  valueCount: number;
}

export interface PrescriptionListRequest {
  query?: string;
  dateFrom?: CalendarDate | null;
  dateTo?: CalendarDate | null;
  limit?: number;
  offset?: number;
}

export interface PrescriptionsByClientRequest {
  clientId: number;
  limit?: number;
  offset?: number;
}

export interface PrescriptionListPage {
  items: PrescriptionSummary[];
  total: number;
  limit: number;
  offset: number;
}

export interface PrescriptionRevisionValue {
  id: number;
  revisionId: number;
  distance: PrescriptionDistance;
  eye: Eye;
  sphere: DecimalValue | null;
  cylinder: DecimalValue | null;
  axis: number | null;
  dip: DecimalValue | null;
  height: DecimalValue | null;
}

export interface PrescriptionRevision {
  id: number;
  prescriptionId: number;
  revisionNumber: number;
  reason: string;
  prescriptionDate: CalendarDate;
  prescriberName: string | null;
  additionOd: DecimalValue | null;
  additionOi: DecimalValue | null;
  notes: string | null;
  correctedAt: IsoTimestamp;
  values: PrescriptionRevisionValue[];
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
  productColor: string | null;
  supplier: string | null;
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
  productColor?: string | null;
  supplier?: string | null;
  colorType?: ColorType | null;
  observations?: string | null;
  treatmentIds?: string[];
  treatmentNames?: string[];
}

export interface UpdateOpticalJobInput {
  prescriptionId?: number | null;
  jobNumber?: string | null;
  product?: string | null;
  frameCondition?: FrameCondition | null;
  frameMaterial?: FrameMaterial | null;
  frameModel?: string | null;
  productColor?: string | null;
  supplier?: string | null;
  colorType?: ColorType | null;
  observations?: string | null;
  treatmentIds?: string[];
  treatmentNames?: string[];
}

export interface OpticalJobSummary {
  id: number;
  clientId: number;
  clientFirstName: string;
  clientLastName: string;
  prescriptionId: number | null;
  jobNumber: string | null;
  product: string | null;
  frameModel: string | null;
  createdAt: IsoTimestamp;
  updatedAt: IsoTimestamp;
}

export interface OpticalJobListRequest {
  query?: string;
  limit?: number;
  offset?: number;
}

export interface OpticalJobsByClientRequest {
  clientId: number;
  limit?: number;
  offset?: number;
}

export interface OpticalJobsByPrescriptionRequest {
  prescriptionId: number;
  limit?: number;
  offset?: number;
}

export interface OpticalJobListPage {
  items: OpticalJobSummary[];
  total: number;
  limit: number;
  offset: number;
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

export type DeliveryRecipientType = 'OWNER' | 'AUTHORIZED_THIRD_PARTY';
export type DeliveryReceiptStatus = 'CONFIRMED' | 'CORRECTED' | 'ANNULLED';
export type DeliveryReceiptEventType = 'CORRECTION_NOTE' | 'ANNULLED';

export interface DeliveryReceiptEvent {
  id: number;
  receiptId: number;
  type: DeliveryReceiptEventType;
  reason: string;
  createdAt: IsoTimestamp;
}

export interface DeliveryReceipt {
  id: number;
  receiptNumber: string;
  opticalJobId: number;
  deliveredAt: IsoTimestamp;
  registeredAt: IsoTimestamp;
  status: DeliveryReceiptStatus;
  clientFirstName: string;
  clientLastName: string;
  clientDocumentNumber: string | null;
  clientPhone: string | null;
  jobNumber: string | null;
  product: string | null;
  frameCondition: FrameCondition | null;
  frameMaterial: FrameMaterial | null;
  frameModel: string | null;
  productColor: string | null;
  supplier: string | null;
  colorType: ColorType | null;
  productObservations: string | null;
  treatmentNames: string[];
  recipientType: DeliveryRecipientType;
  recipientFullName: string;
  recipientDocumentNumber: string | null;
  recipientRelationship: string | null;
  authorizationReference: string | null;
  authorizationConfirmed: boolean;
  deliveredBy: string;
  deliveryNotes: string | null;
  deliveryConfirmed: true;
  events: DeliveryReceiptEvent[];
}

export interface CreateDeliveryReceiptInput {
  opticalJobId: number;
  deliveredAt: IsoTimestamp;
  recipientType: DeliveryRecipientType;
  recipientFullName: string;
  recipientDocumentNumber?: string | null;
  recipientRelationship?: string | null;
  authorizationReference?: string | null;
  authorizationConfirmed?: boolean;
  deliveredBy: string;
  deliveryNotes?: string | null;
  deliveryConfirmed: boolean;
}

export interface CreateDeliveryReceiptEventInput {
  receiptId: number;
  type: DeliveryReceiptEventType;
  reason: string;
}

export interface DeliveryReceiptExportResult {
  canceled: boolean;
  fileName: string | null;
}

export interface DashboardSummary {
  activeClients: number;
  totalPrescriptions: number;
  totalOpticalJobs: number;
}

export interface GlobalSearchRequest {
  query: string;
  limit?: number;
}

export interface GlobalClientSearchResult {
  id: number;
  firstName: string;
  lastName: string;
  documentNumber: string | null;
  phone: string | null;
  isArchived: boolean;
}

export interface GlobalPrescriptionSearchResult {
  id: number;
  clientId: number;
  clientFirstName: string;
  clientLastName: string;
  prescriptionDate: CalendarDate;
}

export interface GlobalOpticalJobSearchResult {
  id: number;
  clientId: number;
  clientFirstName: string;
  clientLastName: string;
  jobNumber: string | null;
  product: string | null;
}

export interface GlobalSearchResults {
  clients: GlobalClientSearchResult[];
  prescriptions: GlobalPrescriptionSearchResult[];
  opticalJobs: GlobalOpticalJobSearchResult[];
  limit: number;
}

export interface SecurityStatus {
  configured: boolean;
  authenticated: boolean;
  inactivityMinutes: number;
  retryAfterSeconds: number;
}

export interface BackupStatus {
  localDirectory: string;
  exportDirectory: string | null;
  lastBackupAt: IsoTimestamp | null;
  lastBackupFile: string | null;
  lastErrorAt: IsoTimestamp | null;
  automaticEnabled: boolean;
  automaticHour: number;
  retentionCount: number;
  due: boolean;
  busy: boolean;
  remoteSyncVerified: false;
}

export interface BackupMetadata {
  formatVersion: number;
  createdAt: IsoTimestamp;
  appVersion: string;
  schemaMigrations: string[];
}

export interface BackupOperationResult {
  fileName: string;
  createdAt: IsoTimestamp;
  exportedToSyncFolder: boolean;
  exportError: boolean;
  remoteSyncVerified: false;
}
