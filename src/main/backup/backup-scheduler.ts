import type { ApplicationDatabase } from '../database';
import type { BackupService } from './backup-service';
import type { BackupCredentialStore } from './backup-credential-store';

export type BackupSchedulerReason = 'STARTUP' | 'INTERVAL' | 'RESUME' | 'CONFIGURATION';
export type BackupSchedulerResult =
  | 'DISABLED'
  | 'NOT_DUE'
  | 'ALREADY_ATTEMPTED'
  | 'BUSY'
  | 'BLOCKED'
  | 'CREATED'
  | 'EXTERNAL_RETRIED'
  | 'EXTERNAL_PENDING'
  | 'FAILED';

const CHECK_INTERVAL_MS = 60_000;

export class BackupScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private checking = false;

  public constructor(
    private readonly backups: BackupService,
    private readonly credentials: BackupCredentialStore,
    private readonly database: ApplicationDatabase,
    private readonly now: () => Date = () => new Date(),
    private readonly setIntervalFn: typeof setInterval = setInterval,
    private readonly clearIntervalFn: typeof clearInterval = clearInterval,
  ) {}

  public start(): void {
    if (this.timer) return;
    void this.refreshCredentialAndCheck('STARTUP');
    this.timer = this.setIntervalFn(() => void this.checkNow('INTERVAL'), CHECK_INTERVAL_MS);
  }

  public stop(): void {
    if (this.timer) this.clearIntervalFn(this.timer);
    this.timer = null;
  }

  public async refreshCredentialAndCheck(
    reason: BackupSchedulerReason = 'CONFIGURATION',
  ): Promise<BackupSchedulerResult> {
    const state = await this.credentials.inspect();
    this.backups.setProtectedCredentialState(state);
    return this.checkNow(reason);
  }

  public async checkNow(reason: BackupSchedulerReason): Promise<BackupSchedulerResult> {
    void reason;
    if (this.checking) return 'BUSY';
    this.checking = true;
    try {
      const retry = await this.backups.retryPendingExternalCopy();
      if (retry === 'SUCCESS') return 'EXTERNAL_RETRIED';
      if (retry === 'PENDING' || retry === 'FAILED') return 'EXTERNAL_PENDING';
      if (retry === 'BUSY') return 'BUSY';
      const status = this.backups.status();
      if (retry === 'NOT_DUE' && status.externalCopyStatus === 'PENDING') return 'EXTERNAL_PENDING';
      if (!status.automaticEnabled) return 'DISABLED';
      if (!status.due) return 'NOT_DUE';
      if (this.backups.automaticAttemptedForCurrentWindow(this.now())) return 'ALREADY_ATTEMPTED';
      if (this.backups.isCriticalOperation()) return 'BUSY';
      const { password, revision } = await this.credentials.retrieveSnapshot();
      if (!this.credentials.isCurrent(revision)) return 'BUSY';
      this.backups.setProtectedCredentialState(this.credentials.state());
      const refreshed = this.backups.status();
      if (!refreshed.automaticEnabled) return 'DISABLED';
      if (!refreshed.due) return 'NOT_DUE';
      if (this.backups.automaticAttemptedForCurrentWindow(this.now())) return 'ALREADY_ATTEMPTED';
      if (this.backups.isCriticalOperation()) return 'BUSY';
      await this.backups.create(this.database, password, 'AUTOMATIC');
      return 'CREATED';
    } catch (error: unknown) {
      this.backups.setProtectedCredentialState(this.credentials.state());
      if (!this.backups.automaticAttemptedForCurrentWindow(this.now()))
        this.backups.recordAutomaticFailure(error);
      return this.credentials.state() === 'READY' ? 'FAILED' : 'BLOCKED';
    } finally {
      this.checking = false;
    }
  }
}
