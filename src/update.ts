import process from 'node:process';
import { getConfigFilePath, setConfig } from './config.js';
import type { Options } from './types.js';

const exitTimeout = 1000 * 30;

async function getLatestVersion(
  packageName: string,
  distTag: string = 'latest',
): Promise<string> {
  const response = await fetch(
    `https://npm.antfu.dev/${packageName}@${distTag}`,
  );

  if (!response.ok) {
    throw new Error(
      `Failed to resolve ${packageName}@${distTag}: ${response.status}`,
    );
  }

  const { version } = (await response.json()) as { version: string };
  return version;
}

const [, , rawOptions] = process.argv;

if (!rawOptions) {
  console.error('Missing options argument');
  process.exit(1);
}

const options = JSON.parse(rawOptions) as Options;

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
  process.exit(1);
}
