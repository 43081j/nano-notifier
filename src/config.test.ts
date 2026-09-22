import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import process from 'node:process';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import {
  configDirectory,
  defaultCheckInterval,
  getConfig,
  getConfigFilePath,
  setConfig,
  xdgConfig,
} from './config.js';

let temporaryDirectory: string;

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(
    path.join(import.meta.dirname, '..', '.test-tmp-'),
  );
});

afterEach(() => {
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('defaultCheckInterval', () => {
  test('is one day', () => {
    expect(defaultCheckInterval).toBe(86_400_000);
  });
});

describe('xdgConfig', () => {
  test('uses XDG_CONFIG_HOME when set', async () => {
    vi.stubEnv('XDG_CONFIG_HOME', path.join(temporaryDirectory, 'xdg'));
    vi.resetModules();

    const config = await import('./config.js');

    expect(config.xdgConfig).toBe(path.join(temporaryDirectory, 'xdg'));
  });

  test('falls back to the home directory when unset', async () => {
    vi.stubEnv('XDG_CONFIG_HOME', undefined);
    vi.resetModules();

    const config = await import('./config.js');

    expect(config.xdgConfig).toBe(path.join(os.homedir(), '.config'));
  });
});

describe('configDirectory', () => {
  test('is the nano-notifier directory of the XDG config directory', () => {
    expect(configDirectory).toBe(path.join(xdgConfig, 'nano-notifier'));
  });
});

describe('getConfigFilePath', () => {
  test('computes a path inside the config directory', () => {
    expect(getConfigFilePath('foo')).toBe(
      path.join(configDirectory, 'foo.json'),
    );
  });

  test('retains characters which are valid in a file name', () => {
    expect(getConfigFilePath('@scope/pkg.name-here_x')).toBe(
      path.join(configDirectory, '@scope-pkg.name-here_x.json'),
    );
  });

  test('replaces each run of invalid characters with a single dash', () => {
    expect(getConfigFilePath('a/\\:*b  c')).toBe(
      path.join(configDirectory, 'a-b-c.json'),
    );
  });
});

describe('getConfig', () => {
  test('reads an existing config', () => {
    const filePath = path.join(temporaryDirectory, 'config.json');
    fs.writeFileSync(
      filePath,
      JSON.stringify({ time: 123, latestVersion: '1.2.3' }),
    );

    expect(getConfig(filePath)).toEqual({ time: 123, latestVersion: '1.2.3' });
  });

  test('returns undefined when the file does not exist', () => {
    const filePath = path.join(temporaryDirectory, 'missing.json');

    expect(getConfig(filePath)).toBeUndefined();
  });

  test('returns undefined when the file contains invalid JSON', () => {
    const filePath = path.join(temporaryDirectory, 'broken.json');
    fs.writeFileSync(filePath, '{not json');

    expect(getConfig(filePath)).toBeUndefined();
  });

  test('throws other errors', () => {
    const filePath = path.join(temporaryDirectory, 'directory');
    fs.mkdirSync(filePath);

    expect(() => getConfig(filePath)).toThrow();
  });
});

describe('setConfig', () => {
  test('writes the config as JSON', () => {
    const filePath = path.join(temporaryDirectory, 'nested', 'config.json');

    setConfig(filePath, { time: 123, latestVersion: '1.2.3' });

    expect(JSON.parse(fs.readFileSync(filePath, 'utf8'))).toEqual({
      time: 123,
      latestVersion: '1.2.3',
    });
  });

  test('creates the containing directory', () => {
    const filePath = path.join(
      temporaryDirectory,
      'a',
      'b',
      'c',
      'config.json',
    );

    setConfig(filePath, { time: 123 });

    expect(fs.existsSync(filePath)).toBe(true);
  });

  test('leaves no temporary file behind', () => {
    const filePath = path.join(temporaryDirectory, 'config.json');

    setConfig(filePath, { time: 123 });

    expect(fs.readdirSync(temporaryDirectory)).toEqual(['config.json']);
  });

  test('overwrites an existing config', () => {
    const filePath = path.join(temporaryDirectory, 'config.json');
    fs.writeFileSync(filePath, JSON.stringify({ time: 1 }));

    setConfig(filePath, { time: 2 });

    expect(getConfig(filePath)).toEqual({ time: 2 });
  });

  test.runIf(process.platform !== 'win32')(
    'writes the config as user-readable only',
    () => {
      const filePath = path.join(temporaryDirectory, 'nested', 'config.json');

      setConfig(filePath, { time: 123 });

      expect(fs.statSync(filePath).mode & 0o777).toBe(0o600);
      expect(fs.statSync(path.dirname(filePath)).mode & 0o777).toBe(0o700);
    },
  );
});
