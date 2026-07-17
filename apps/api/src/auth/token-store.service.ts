import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Credentials } from 'google-auth-library';
import { mkdir, readFile, rename, unlink, writeFile } from 'node:fs/promises';
import { dirname, isAbsolute, resolve } from 'node:path';

@Injectable()
export class TokenStoreService {
  private readonly tokenPath: string;

  constructor(config: ConfigService) {
    const configuredPath = config.get<string>('GOOGLE_TOKEN_PATH', '.data/google-tokens.json');
    this.tokenPath = isAbsolute(configuredPath)
      ? configuredPath
      : resolve(__dirname, '..', '..', '..', '..', configuredPath);
  }

  async read(): Promise<Credentials | null> {
    try {
      return JSON.parse(await readFile(this.tokenPath, 'utf8')) as Credentials;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') return null;
      throw error;
    }
  }

  async write(tokens: Credentials): Promise<void> {
    const current = await this.read();
    const merged = { ...current, ...tokens };
    const temporaryPath = `${this.tokenPath}.tmp`;

    await mkdir(dirname(this.tokenPath), { recursive: true });
    await writeFile(temporaryPath, JSON.stringify(merged, null, 2), {
      encoding: 'utf8',
      mode: 0o600,
    });
    await rename(temporaryPath, this.tokenPath);
  }

  async clear(): Promise<void> {
    try {
      await unlink(this.tokenPath);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
    }
  }

  async hasRefreshToken(): Promise<boolean> {
    return Boolean((await this.read())?.refresh_token);
  }
}
