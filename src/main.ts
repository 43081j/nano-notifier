import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import fs from 'node:fs';
import { styleText } from 'node:util';
import { difference, isGreaterThan } from 'verkit';
import { box } from '@clack/prompts';
import {
  configDirectory,
  defaultCheckInterval,
  getConfig,
  getConfigFilePath,
  getRetryTime,
  setConfig,
} from './config.js';
import { getLatestVersion } from './registry.js';
import type { VersionDifference } from 'verkit';
import type { Config, NotifierLike, NotifyOptions, Options } from './types.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const updaterPath = path.join(dirname, 'update.js');
const userAgent = process.env.npm_config_user_agent ?? '';
const isNpmOrYarn =
  userAgent.startsWith('npm/') || userAgent.startsWith('yarn/');
const globalNodeModules =
  process.platform === 'win32'
    ? path.join(path.dirname(process.execPath), 'node_modules')
    : path.join(
        path.dirname(path.dirname(process.execPath)),
        'lib',
        'node_modules',
      );
const isInstalledGlobally = dirname.startsWith(globalNodeModules + path.sep);
const homeDirectory = os.homedir();
const displayedConfigDirectory = configDirectory.startsWith(
  homeDirectory + path.sep,
)
  ? path.join('~', configDirectory.slice(homeDirectory.length + 1))
  : configDirectory;
const unixPermissionHint = `
 The updater couldn't write to its config store.
 Take ownership of it via
${styleText('cyan', ` sudo chown -R $USER:$(id -gn $USER) ${displayedConfigDirectory} `)}`;
const windowsPermissionHint = `
 The updater couldn't write to its config store.
 Grant your user write access to
${styleText('cyan', ` ${displayedConfigDirectory} `)}`;
const permissionHint =
  process.platform === 'win32' ? windowsPermissionHint : unixPermissionHint;
const updateTypeLabels: Record<VersionDifference, string> = {
  major: 'Major update',
  minor: 'Minor update',
  patch: 'Patch update',
  premajor: 'Major prerelease',
  preminor: 'Minor prerelease',
  prepatch: 'Patch prerelease',
  prerelease: 'Prerelease',
};
const isInCi = 'CI' in process.env && process.env.CI !== 'false';
// Support update-notifier's env variable for cross compat
const shouldDisable =
  'NO_UPDATE_NOTIFIER' in process.env ||
  process.env.NODE_ENV === 'test' ||
  isInCi;

export * from './types.js';

class Notifier implements NotifierLike {
  latest?: string;
  outdated: boolean = false;
  updateType?: VersionDifference | undefined;

  #config?: Config;
  #configFilePath: string;
  #isNewConfig: boolean = false;
  #storeUnavailable: boolean = false;
  #name: string;
  #version: string;
  #interval: number;
  #options: Options;

  constructor(options: Options) {
    this.#options = options;
    this.#name = options.name;
    this.#version = options.version;
    this.#interval =
      typeof options.interval === 'number'
        ? options.interval
        : defaultCheckInterval;
    this.#configFilePath = getConfigFilePath(this.#name);

    try {
      const config = getConfig(this.#configFilePath);
      this.#config = config ?? { time: Date.now() };
      this.#isNewConfig = config === undefined;
    } catch {
      this.#storeUnavailable = true;
    }
  }

  get current() {
    return this.#version;
  }

  #save(config: Config): void {
    try {
      setConfig(this.#configFilePath, config);
    } catch {
      this.#storeUnavailable = true;
    }
  }

  #renderStoreUnavailable(): void {
    const message =
      styleText('yellow', ` ${this.#name}: update checks are disabled `) +
      permissionHint;
    box(message, undefined, {
      output: process.stderr,
      contentAlign: 'center',
      withGuide: false,
      width: 'auto',
    });
  }

  #applyLatest(latestVersion: string): void {
    this.latest = latestVersion;
    this.outdated = isGreaterThan(latestVersion, this.#version);
    if (this.outdated) {
      this.updateType = difference(this.#version, latestVersion) ?? undefined;
    }
  }

  async #checkInline(config: Config): Promise<void> {
    try {
      const latestVersion = await getLatestVersion(
        this.#name,
        this.#options.distTag,
      );
      config.time = Date.now();
      this.#applyLatest(latestVersion);
    } catch {
      config.time = getRetryTime(this.#interval);
    }

    this.#save(config);
  }

  async check(): Promise<void> {
    const config = this.#config;

    if (!config) {
      return;
    }

    if (config.latestVersion) {
      this.#applyLatest(config.latestVersion);
      config.latestVersion = undefined;
      this.#save(config);
    } else if (this.#isNewConfig) {
      this.#save(config);
    }

    if (Date.now() - config.time < this.#interval) {
      return;
    }

    // A bundled CLI has no `update.js` alongside it to spawn, so the check
    // happens in-process instead and its result is used straight away
    if (!fs.existsSync(updaterPath)) {
      await this.#checkInline(config);
      return;
    }

    spawn(process.execPath, [updaterPath, JSON.stringify(this.#options)], {
      detached: true,
      stdio: 'ignore',
    }).unref();
  }

  notify(options?: NotifyOptions): void {
    if (!process.stdout.isTTY || isNpmOrYarn) {
      return;
    }

    if (this.#storeUnavailable) {
      if (options?.defer === false) {
        this.#renderStoreUnavailable();
      } else {
        process.on('exit', () => this.#renderStoreUnavailable());
      }
      return;
    }

    if (!this.outdated) {
      return;
    }

    if (options?.defer === false) {
      this.#render(options);
    } else {
      process.on('exit', () => this.#render(options));
    }
  }

  #render(options: NotifyOptions | undefined): void {
    if (!this.latest) {
      return;
    }

    const installCommand = isInstalledGlobally
      ? `npm i -g ${this.#name}`
      : `npm i ${this.#name}`;
    const latest = this.latest;
    const heading = this.updateType
      ? updateTypeLabels[this.updateType]
      : 'Update';
    const defaultMessage = `${heading} available ${styleText('dim', this.#version)}${styleText('reset', ' → ')}${styleText('green', latest)}
Run ${styleText('cyan', installCommand)} to update`;
    const message = options?.message ?? defaultMessage;

    box(message, options?.title, {
      output: process.stderr,
      contentAlign: 'center',
      withGuide: false,
      width: 'auto',
      formatBorder: (border) => styleText('yellow', border),
      ...options?.boxOptions,
    });
  }
}

class NoopNotifier implements NotifierLike {
  current: string;
  latest?: string;
  outdated: boolean = false;
  updateType?: VersionDifference;

  constructor(options: Options) {
    this.current = options.version;
  }

  async check() {
    // do nothing
  }

  notify() {
    // do nothing
  }
}

export async function notifier(options: Options): Promise<NotifierLike> {
  if (shouldDisable) {
    return new NoopNotifier(options);
  }

  const instance = new Notifier(options);
  await instance.check();
  return instance;
}
