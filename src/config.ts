import process from 'node:process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import type { Config } from './types.js';

export const xdgConfig =
  process.env.XDG_CONFIG_HOME || path.join(os.homedir(), '.config');

export function getConfigFilePath(packageName: string): string {
  const fileName = packageName.replaceAll(/[^\w@.-]+/g, '-');
  return path.join(xdgConfig, 'nano-notifier', `${fileName}.json`);
}

export function getConfig(filePath: string): Config | undefined {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8')) as Config;
  } catch (error) {
    if (
      (error as NodeJS.ErrnoException).code === 'ENOENT' ||
      error instanceof SyntaxError
    ) {
      return undefined;
    }

    throw error;
  }
}

export function setConfig(filePath: string, config: Config): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true, mode: 0o700 });

  const temporaryPath = `${filePath}.${process.pid}`;
  fs.writeFileSync(temporaryPath, JSON.stringify(config, undefined, '\t'), {
    mode: 0o600,
  });
  fs.renameSync(temporaryPath, filePath);
}
