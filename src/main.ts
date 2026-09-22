import process from 'node:process';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { styleText } from 'node:util';
import { isGreaterThan } from 'verkit';
import { box } from '@clack/prompts';
import {
  getConfig,
  getConfigFilePath,
  setConfig,
  xdgConfig,
} from './config.js';
import type { Config, NotifierLike, NotifyOptions, Options } from './types.js';

const dirname = path.dirname(fileURLToPath(import.meta.url));
const defaultCheckInterval = 1000 * 60 * 60 * 24;
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
const unixPermissionHint = `
 Try running with ${styleText('cyan', 'sudo')} or get access
 to the local update config store via
${styleText('cyan', ` sudo chown -R $USER:$(id -gn $USER) ${xdgConfig} `)}`;
const windowsPermissionHint = `
 Check that you have write access to
${styleText('cyan', ` ${xdgConfig} `)}`;
const permissionHint =
  process.platform === 'win32' ? windowsPermissionHint : unixPermissionHint;
const isInCi = 'CI' in process.env && process.env.CI !== 'false';
// Support update-notifier's env variable for cross compat
const shouldDisable =
  'NO_UPDATE_NOTIFIER' in process.env ||
  process.env.NODE_ENV === 'test' ||
  isInCi;

export * from './types.js';

export class Notifier implements NotifierLike {
  config?: Config;
  latest?: string;
  outdated: boolean = false;

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
      this.config = config;
    } catch {
      process.on('exit', () => this.#onExit());
    }
  }

  get current() {
    return this.#version;
  }

  #onExit(): void {
    const message =
      styleText('yellow', ` ${this.#name} update check failed `) +
      permissionHint;
    box(message, undefined, {
      output: process.stderr,
      contentAlign: 'center',
      withGuide: false,
    });
  }

  check() {
    if (!this.config) {
      return;
    }

    if (this.config.latestVersion) {
      this.latest = this.config.latestVersion;
      this.outdated = isGreaterThan(this.latest, this.#version);
      this.config.latestVersion = undefined;
      setConfig(this.#configFilePath, this.config);
    }

    if (Date.now() - this.config.time < this.#interval) {
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
    const defaultMessage = `Update available ${styleText('dim', this.#version)}${styleText('reset', ' → ')}${styleText('green', latest)}
Run ${styleText('cyan', installCommand)} to update`;
    const message = options?.message ?? defaultMessage;

    const { message: _message, defer: _defer, ...boxOptions } = options ?? {};
    box(message, undefined, {
      output: process.stderr,
      contentAlign: 'center',
      withGuide: false,
      formatBorder: (border) => styleText('yellow', border),
      ...boxOptions,
    });
  }
}

export class NoopNotifier implements NotifierLike {
  current: string;
  latest?: string;
  outdated: boolean = false;

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
