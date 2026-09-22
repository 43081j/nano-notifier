import process from 'node:process';
import { box } from '@clack/prompts';
import { notifier } from '../../lib/main.js';

process.stdout.isTTY = true;

const instance = await notifier({ name: 'fake-pkg', version: '1.0.0' });

instance.notify({
  onMessage: (message) => {
    box(message, 'fake-pkg', {
      output: process.stderr,
      width: 'auto',
    });
  },
});

process.stdout.write(
  JSON.stringify({
    current: instance.current,
    latest: instance.latest,
    outdated: instance.outdated,
    updateType: instance.updateType,
  }),
);
