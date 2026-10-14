import { randomBytes, scrypt as nodeScrypt, timingSafeEqual } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import type { SecurityStatus } from '../../shared/database-models';

const KDF = { N: 32_768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 } as const;

interface SecurityConfig {
  version: 1;
  salt: string;
  verifier: string;
  inactivityMinutes: number;
}

export class AuthenticationRequiredError extends Error {}
export class SecurityConfigurationError extends Error {}

function validatePassword(password: unknown): asserts password is string {
  if (typeof password !== 'string' || password.length < 10 || password.length > 128) {
    throw new SecurityConfigurationError('La contraseña debe tener entre 10 y 128 caracteres.');
  }
}

function validateMinutes(value: unknown): asserts value is number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1 || value > 240) {
    throw new SecurityConfigurationError('El tiempo de bloqueo no es válido.');
  }
}

async function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    nodeScrypt(password, salt, 32, KDF, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

export class SecurityManager {
  private config: SecurityConfig | null;
  private authenticated = false;
  private lastActivity = 0;
  private failedAttempts = 0;
  private retryAt = 0;

  public constructor(private readonly configPath: string) {
    this.config = this.load();
  }

  public status(): SecurityStatus {
    this.expireIfNeeded();
    return {
      configured: this.config !== null,
      authenticated: this.authenticated,
      inactivityMinutes: this.config?.inactivityMinutes ?? 15,
      retryAfterSeconds: Math.max(0, Math.ceil((this.retryAt - Date.now()) / 1000)),
    };
  }

  public async setup(password: unknown, inactivityMinutes: unknown): Promise<SecurityStatus> {
    if (this.config) throw new SecurityConfigurationError('La protección ya está configurada.');
    validatePassword(password);
    validateMinutes(inactivityMinutes);
    const salt = randomBytes(16);
    this.config = {
      version: 1,
      salt: salt.toString('base64'),
      verifier: (await derive(password, salt)).toString('base64'),
      inactivityMinutes,
    };
    this.save();
    this.authenticated = true;
    this.touch();
    return this.status();
  }

  public async login(password: unknown): Promise<SecurityStatus> {
    if (!this.config) throw new SecurityConfigurationError('La protección no está configurada.');
    validatePassword(password);
    if (Date.now() < this.retryAt)
      throw new SecurityConfigurationError('Esperá antes de volver a intentar.');
    const candidate = await derive(password, Buffer.from(this.config.salt, 'base64'));
    const expected = Buffer.from(this.config.verifier, 'base64');
    if (candidate.length !== expected.length || !timingSafeEqual(candidate, expected)) {
      this.failedAttempts += 1;
      if (this.failedAttempts >= 5)
        this.retryAt = Date.now() + Math.min(30, 2 ** (this.failedAttempts - 5) * 2) * 1000;
      throw new SecurityConfigurationError('La contraseña no es correcta.');
    }
    this.failedAttempts = 0;
    this.retryAt = 0;
    this.authenticated = true;
    this.touch();
    return this.status();
  }

  public logout(): SecurityStatus {
    this.authenticated = false;
    return this.status();
  }

  public touchSession(): SecurityStatus {
    this.requireAuthenticated();
    return this.status();
  }

  public requireAuthenticated(): void {
    this.expireIfNeeded();
    if (!this.authenticated) throw new AuthenticationRequiredError('Autenticación requerida.');
    this.touch();
  }

  public async changePassword(current: unknown, next: unknown): Promise<void> {
    this.requireAuthenticated();
    validatePassword(next);
    await this.login(current);
    const salt = randomBytes(16);
    this.config = {
      ...this.config!,
      salt: salt.toString('base64'),
      verifier: (await derive(next, salt)).toString('base64'),
    };
    this.save();
  }

  public setInactivity(minutes: unknown): SecurityStatus {
    this.requireAuthenticated();
    validateMinutes(minutes);
    this.config = { ...this.config!, inactivityMinutes: minutes };
    this.save();
    return this.status();
  }

  private touch(): void {
    this.lastActivity = Date.now();
  }
  private expireIfNeeded(): void {
    if (
      this.authenticated &&
      this.config &&
      Date.now() - this.lastActivity >= this.config.inactivityMinutes * 60_000
    )
      this.authenticated = false;
  }
  private load(): SecurityConfig | null {
    if (!existsSync(this.configPath)) return null;
    try {
      const value = JSON.parse(readFileSync(this.configPath, 'utf8')) as SecurityConfig;
      if (
        value.version !== 1 ||
        typeof value.salt !== 'string' ||
        Buffer.from(value.salt, 'base64').length !== 16 ||
        typeof value.verifier !== 'string' ||
        Buffer.from(value.verifier, 'base64').length !== 32
      )
        throw new Error();
      validateMinutes(value.inactivityMinutes);
      return value;
    } catch {
      throw new SecurityConfigurationError('La configuración de seguridad está dañada.');
    }
  }
  private save(): void {
    writeFileSync(this.configPath, JSON.stringify(this.config), { encoding: 'utf8', mode: 0o600 });
  }
}
