import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { renderString } from 'ansivision';
import { spawnSync } from 'node:child_process';
import process from 'node:process';
import path from 'node:path';
import fs from 'node:fs';
import type { Config, NotifyOptions, Options } from './types.js';

const projectRoot = path.join(import.meta.dirname, '..');
const fixturePath = path.join(projectRoot, 'test', 'fixtures', 'notifier.js');

interface FixtureOptions {
  options?: Partial<Options>;
  notify?: NotifyOptions;
  tty?: boolean;
}

interface FixtureState {
  current: string;
  latest?: string;
  outdated: boolean;
  updateType?: string;
}

interface FixtureResult {
  stderr: string;
  status: number | null;
  state: FixtureState;
}

let temporaryDirectory: string;
let configDirectory: string;
let configFilePath: string;

function run(
  fixtureOptions: FixtureOptions = {},
  environment: Record<string, string> = {},
): FixtureResult {
  const baseEnvironment = { ...process.env };

  // The test run may itself be in CI and is launched by a package manager,
  // both of which would disable the notifier in the child process
  delete baseEnvironment.CI;
  delete baseEnvironment.NO_UPDATE_NOTIFIER;
  delete baseEnvironment.npm_config_user_agent;

  const result = spawnSync(
    process.execPath,
    [fixturePath, JSON.stringify({ tty: true, ...fixtureOptions })],
    {
      encoding: 'utf8',
      // A relative config directory keeps the paths the notifier prints out
      // of the snapshots
      cwd: temporaryDirectory,
      env: {
        ...baseEnvironment,
        NODE_ENV: 'production',
        FORCE_COLOR: 'true',
        XDG_CONFIG_HOME: '.config',
        ...environment,
      },
    },
  );

  return {
    stderr: result.stderr,
    status: result.status,
    state: JSON.parse(result.stdout) as FixtureState,
  };
}

async function frames(output: string): Promise<string[]> {
  const renderer = await renderString(output);

  return renderer.frames.map((_frame, index) => {
    renderer.goToFrame(index);
    return renderer.getStyledFrame();
  });
}

function readConfig(): Config {
  return JSON.parse(fs.readFileSync(configFilePath, 'utf8')) as Config;
}

function writeConfig(config: Config): void {
  fs.mkdirSync(configDirectory, { recursive: true });
  fs.writeFileSync(configFilePath, JSON.stringify(config));
}

beforeEach(() => {
  temporaryDirectory = fs.mkdtempSync(path.join(projectRoot, '.test-tmp-'));
  configDirectory = path.join(temporaryDirectory, '.config', 'nano-updater');
  configFilePath = path.join(configDirectory, 'fake-pkg.json');
});

afterEach(() => {
  fs.chmodSync(temporaryDirectory, 0o700);
  if (fs.existsSync(configDirectory)) {
    fs.chmodSync(configDirectory, 0o700);
  }
  fs.rmSync(temporaryDirectory, { recursive: true, force: true });
});

describe('notifier', () => {
  test('creates a config on first run without notifying', () => {
    const result = run();

    expect(result.stderr).toBe('');
    expect(result.state).toEqual({ current: '1.0.0', outdated: false });
    expect(readConfig().time).toBeTypeOf('number');
  });

  test('notifies of an update found by a previous run', async () => {
    run();
    writeConfig({ ...readConfig(), latestVersion: '2.0.0' });

    const result = run();

    expect(result.state).toEqual({
      current: '1.0.0',
      latest: '2.0.0',
      outdated: true,
      updateType: 'major',
    });
    expect(await frames(result.stderr)).toMatchSnapshot();
  });

  test('consumes the latest version so it notifies only once', () => {
    run();
    writeConfig({ ...readConfig(), latestVersion: '2.0.0' });
    run();

    const result = run();

    expect(readConfig().latestVersion).toBeUndefined();
    expect(result.state.outdated).toBe(false);
    expect(result.stderr).toBe('');
  });

  test('ignores a latest version which is not newer', () => {
    run();
    writeConfig({ ...readConfig(), latestVersion: '0.9.0' });

    const result = run();

    expect(result.state.outdated).toBe(false);
    expect(result.stderr).toBe('');
  });

  test.for([
    ['1.1.0', 'minor'],
    ['1.0.1', 'patch'],
    ['2.0.0-beta.1', 'premajor'],
  ])('describes %s as a %s update', async ([latestVersion, updateType]) => {
    run();
    writeConfig({ ...readConfig(), latestVersion });

    const result = run();

    expect(result.state.updateType).toBe(updateType);
    expect(await frames(result.stderr)).toMatchSnapshot();
  });

  test('renders a custom message', async () => {
    run();
    writeConfig({ ...readConfig(), latestVersion: '2.0.0' });

    const result = run({ notify: { message: 'Time to update!' } });

    expect(await frames(result.stderr)).toMatchSnapshot();
  });

  test('renders a title in the border', async () => {
    run();
    writeConfig({ ...readConfig(), latestVersion: '2.0.0' });

    const result = run({ notify: { title: 'my-cli' } });

    expect(await frames(result.stderr)).toMatchSnapshot();
  });

  test('does not notify without an interactive terminal', () => {
    run();
    writeConfig({ ...readConfig(), latestVersion: '2.0.0' });

    const result = run({ tty: false });

    expect(result.state.outdated).toBe(true);
    expect(result.stderr).toBe('');
  });

  test('does not notify when run by npm or yarn', () => {
    run();
    writeConfig({ ...readConfig(), latestVersion: '2.0.0' });

    const result = run(
      {},
      { npm_config_user_agent: 'npm/11.0.0 node/v26.0.0' },
    );

    expect(result.stderr).toBe('');
  });

  test.for([
    ['CI', 'true'],
    ['NO_UPDATE_NOTIFIER', '1'],
    ['NODE_ENV', 'test'],
  ])('does nothing when %s is set', ([name, value]) => {
    writeConfig({ time: 0, latestVersion: '2.0.0' });

    const result = run({}, { [name!]: value! });

    expect(result.state).toEqual({ current: '1.0.0', outdated: false });
    expect(result.stderr).toBe('');
    expect(readConfig().latestVersion).toBe('2.0.0');
  });

  test('still notifies when CI is explicitly disabled', () => {
    run({}, { CI: 'false' });
    writeConfig({ ...readConfig(), latestVersion: '2.0.0' });

    const result = run({}, { CI: 'false' });

    expect(result.state.outdated).toBe(true);
  });

  test.runIf(process.platform !== 'win32')(
    'warns when the config store cannot be written to',
    async () => {
      fs.chmodSync(temporaryDirectory, 0o500);

      const result = run();

      expect(await frames(result.stderr)).toMatchSnapshot();
    },
  );

  test.runIf(process.platform !== 'win32')(
    'does not write to a config store which is already up to date',
    () => {
      run();
      fs.chmodSync(configDirectory, 0o500);

      const result = run();

      expect(result.status).toBe(0);
      expect(result.stderr).toBe('');
    },
  );

  test.runIf(process.platform !== 'win32')(
    'warns when a found update cannot be consumed',
    async () => {
      run();
      writeConfig({ ...readConfig(), latestVersion: '2.0.0' });
      fs.chmodSync(configDirectory, 0o500);

      const result = run();

      expect(result.state.outdated).toBe(true);
      expect(await frames(result.stderr)).toMatchSnapshot();
    },
  );

  test.runIf(process.platform !== 'win32')(
    'shortens a config store inside the home directory',
    async () => {
      fs.chmodSync(temporaryDirectory, 0o500);

      const result = run(
        {},
        {
          HOME: temporaryDirectory,
          XDG_CONFIG_HOME: path.join(temporaryDirectory, '.config'),
        },
      );

      expect(await frames(result.stderr)).toMatchSnapshot();
    },
  );
});
