import process from 'node:process';
import {
  defaultCheckInterval,
  getConfigFilePath,
  getRetryTime,
  setConfig,
} from './config.js';
import { getLatestVersion } from './registry.js';
import type { Options } from './types.js';

const exitTimeout = 1000 * 30;

const [, , rawOptions] = process.argv;

if (!rawOptions) {
  console.error('Missing options argument');
  process.exit(1);
}

const options = JSON.parse(rawOptions) as Options;
const interval =
  typeof options.interval === 'number'
    ? options.interval
    : defaultCheckInterval;

try {
  setTimeout(process.exit, exitTimeout).unref();

  const latestVersion = await getLatestVersion(options.name, options.distTag);
  setConfig(getConfigFilePath(options.name), {
    time: Date.now(),
    latestVersion,
  });

  process.exit();
} catch (error) {
  console.error(error);

  setConfig(getConfigFilePath(options.name), {
    time: getRetryTime(interval),
  });

  process.exit(1);
}
