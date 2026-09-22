import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { styleText } from 'node:util';
import { difference, isGreaterThan } from 'verkit';
import { box } from '@clack/prompts';
import {
  configDirectory,
  defaultCheckInterval,
  getConfig,
  getConfigFilePath,
  setConfig,
} from './config.js';
import type { VersionDifference } from 'verkit';
import type { Config, NotifierLike, NotifyOptions, Options } from './types.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
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
      const config = getConfig(this.#configFilePath) ?? { time: Date.now() };
      setConfig(this.#configFilePath, config);
      this.#config = config;
    } catch {
      process.on('exit', () => this.#onExit());
    }
  }

  get current() {
    return this.#version;
  }

  #onExit(): void {
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

  check() {
    if (!this.#config) {
      return;
    }

    if (this.#config.latestVersion) {
      this.latest = this.#config.latestVersion;
      this.outdated = isGreaterThan(this.latest, this.#version);
      if (this.outdated) {
        this.updateType = difference(this.#version, this.latest) ?? undefined;
      }
      this.#config.latestVersion = undefined;
      setConfig(this.#configFilePath, this.#config);
    }

    if (Date.now() - this.#config.time < this.#interval) {
      return;
    }

    spawn(
      process.execPath,
      [path.join(dirname, 'update.js'), JSON.stringify(this.#options)],
      {
        detached: true,
        stdio: 'ignore',
      },
    ).unref();
  }

  notify(options?: NotifyOptions): void {
    if (!process.stdout.isTTY || isNpmOrYarn || !this.outdated) {
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

    box(message, undefined, {
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

  check() {
    // do nothing
  }

  notify() {
    // do nothing
  }
}

export function notifier(options: Options): NotifierLike {
  if (shouldDisable) {
    return new NoopNotifier(options);
  }

  const instance = new Notifier(options);
  instance.check();
  return instance;
}
