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
  /**
   * Renders the message rather than letting it be written to stderr. Receives
   * the custom message if one was given, the default message otherwise.
   */
  onMessage?: (message: string) => void;
  defer?: boolean;
}

export interface NotifierLike {
  current: string;
  latest?: string;
  outdated: boolean;
  updateType?: VersionDifference | undefined;
  check(): Promise<void>;
  notify(options?: NotifyOptions): void;
}
