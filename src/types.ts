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
  defer?: boolean;
  contentAlign?: 'left' | 'center' | 'right';
  titleAlign?: 'left' | 'center' | 'right';
  width?: number | 'auto';
  titlePadding?: number;
  contentPadding?: number;
  rounded?: boolean;
  formatBorder?: (text: string) => string;
}

export interface NotifierLike {
  current: string;
  latest?: string;
  outdated: boolean;
  updateType?: VersionDifference | undefined;
  check(): void;
  notify(options?: NotifyOptions): void;
}
