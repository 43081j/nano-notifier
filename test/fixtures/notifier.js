import process from 'node:process';

const { options, notify, tty } = JSON.parse(process.argv[2] ?? '{}');

if (tty) {
  process.stdout.isTTY = true;
}

const { notifier } = await import('../../lib/main.js');

const instance = await notifier({
  name: 'fake-pkg',
  version: '1.0.0',
  ...options,
});

instance.notify(notify);

process.stdout.write(
  JSON.stringify({
    current: instance.current,
    latest: instance.latest,
    outdated: instance.outdated,
    updateType: instance.updateType,
  }),
);
