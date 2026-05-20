import FullCalendarPlugin from '../../../main';
import { GoogleAccount } from '../../../types/settings';

export interface GoogleCredentials {
  refreshToken: string | null;
  accessToken: string | null;
  expiryDate: number | null;
}

const CLIENT_SECRET_ID = 'cortex-full-calendar-google-client-secret';

function toSecretId(input: string): string {
  const normalized = input
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'account';
}

export class GoogleCredentialStore {
  constructor(private readonly plugin: FullCalendarPlugin) {}

  private get secretStorage() {
    return this.plugin.app.secretStorage;
  }

  public getAccountSecretId(accountId: string): string {
    return `cortex-full-calendar-google-${toSecretId(accountId)}`;
  }

  public getClientSecretId(): string {
    return CLIENT_SECRET_ID;
  }

  public getCredentials(account: GoogleAccount): GoogleCredentials {
    const secretId = account.credentialSecretId || this.getAccountSecretId(account.id);
    const secret = this.secretStorage.getSecret(secretId);
    if (secret) {
      try {
        const parsed = JSON.parse(secret) as Partial<GoogleCredentials>;
        return {
          refreshToken: parsed.refreshToken ?? null,
          accessToken: parsed.accessToken ?? null,
          expiryDate: parsed.expiryDate ?? null
        };
      } catch {
        console.warn(`Full Calendar: invalid Google credential secret "${secretId}".`);
      }
    }

    return {
      refreshToken: account.refreshToken ?? null,
      accessToken: account.accessToken ?? null,
      expiryDate: account.expiryDate ?? null
    };
  }

  public setCredentials(account: GoogleAccount, credentials: GoogleCredentials): string {
    const secretId = account.credentialSecretId || this.getAccountSecretId(account.id);
    this.secretStorage.setSecret(secretId, JSON.stringify(credentials));
    return secretId;
  }

  public clearCredentials(account: GoogleAccount): void {
    const secretId = account.credentialSecretId || this.getAccountSecretId(account.id);
    this.secretStorage.setSecret(
      secretId,
      JSON.stringify({ refreshToken: null, accessToken: null, expiryDate: null })
    );
  }

  public getClientSecret(): string {
    return this.secretStorage.getSecret(CLIENT_SECRET_ID) || '';
  }

  public setClientSecret(secret: string): void {
    this.secretStorage.setSecret(CLIENT_SECRET_ID, secret);
  }
}
