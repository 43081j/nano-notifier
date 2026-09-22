import process from 'node:process';

// Copied next to a `lib` with no `update.js` in it, standing in for a CLI
// which has been bundled
process.stdout.isTTY = true;

globalThis.fetch = async () => new Response('Not found', { status: 404 });

const { notifier } = await import('./main.js');

const instance = await notifier({ name: 'fake-pkg', version: '1.0.0' });

instance.notify();

process.stdout.write(
  JSON.stringify({
    current: instance.current,
    latest: instance.latest,
    outdated: instance.outdated,
    updateType: instance.updateType,
  }),
);
