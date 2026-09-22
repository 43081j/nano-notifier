import type { BoxOptions } from '@clack/prompts';
import type { VersionDifference } from 'verkit';

export interface Config {
  time: number;
  latestVersion?: string | undefined;
}

export interface Options {
  name: string;
  version: string;
  distTag?: string;
  interval?: number;
}

export interface NotifyOptions {
  message?: string;
  title?: string;
  defer?: boolean;
  boxOptions?: Omit<BoxOptions, 'input' | 'signal'>;
}

export interface NotifierLike {
  current: string;
  latest?: string;
  outdated: boolean;
  updateType?: VersionDifference | undefined;
  check(): void;
  notify(options?: NotifyOptions): void;
}
