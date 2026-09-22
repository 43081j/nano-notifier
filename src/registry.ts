const registry = 'https://registry.npmjs.org';
const requestTimeout = 1000 * 30;

export async function getLatestVersion(
  packageName: string,
  distTag: string = 'latest',
): Promise<string> {
  const response = await fetch(`${registry}/${packageName}/${distTag}`, {
    signal: AbortSignal.timeout(requestTimeout),
  });

  if (!response.ok) {
    throw new Error(
      `Failed to resolve ${packageName}@${distTag}: ${response.status}`,
    );
  }

  const { version } = (await response.json()) as { version: string };
  return version;
}
