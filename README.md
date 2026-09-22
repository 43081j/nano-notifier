# nano-updater 🔔

Notifies users of your CLI when an update is available.

```
 │ Minor update available 1.0.0 → 1.2.0
 │ Run npm i -g my-cli to update
```

## Install

```sh
npm i nano-updater
```

## Usage

```js
import { notifier } from 'nano-updater';

const instance = await notifier({
  name: 'my-cli',
  version: '1.0.0',
});

instance.notify();
```

The version check runs in a detached background process to avoid slowing
down your main thread. The result is displayed on the next run if a new
version is available.

> NOTE: If you're bundling your CLI, the underlying update script will not
> be included in the bundle. In that case, the check will happen in-process
> and the notification will be shown immediately.

## Options

| Option     | Type     | Default    | Description                           |
| ---------- | -------- | ---------- | ------------------------------------- |
| `name`     | `string` | –          | Package name to check on the registry |
| `version`  | `string` | –          | Currently installed version           |
| `distTag`  | `string` | `latest`   | Dist tag to check against             |
| `interval` | `number` | 1 day (ms) | How often to check for a new version  |

### `notify(options?)`

By default the notification is rendered when your process exits. Pass
`defer: false` to render it immediately.

```js
instance.notify({
  defer: false,
  message: 'A shiny new version is out!',
});
```

| Option      | Type       | Default | Description                            |
| ----------- | ---------- | ------- | -------------------------------------- |
| `message`   | `string`   | –       | Replaces the default update text       |
| `onMessage` | `function` | –       | Renders the message yourself           |
| `defer`     | `boolean`  | `true`  | Render on exit rather than immediately |

### Rendering it yourself

`onMessage` takes over the output, so the notification can go through whichever
renderer your CLI already uses. It receives your `message` if you set one, the
default message otherwise:

```js
import { box } from '@clack/prompts';

instance.notify({
  onMessage: (message) => {
    box(message, 'my-cli', {
      output: process.stderr,
      width: 'auto',
    });
  },
});
```

```
┌─my-cli─────────────────────────────────┐
│  Minor update available 1.0.0 → 1.2.0  │
│  Run npm i -g my-cli to update         │
└────────────────────────────────────────┘
```

### Result

```js
instance.current; // '1.0.0'
instance.latest; // '1.2.0'
instance.outdated; // true
instance.updateType; // 'minor'
```

## Ignoring Updates

Nothing is checked or rendered when:

- `NO_UPDATE_NOTIFIER` is set
- `NODE_ENV` is `test`
- `CI` is set (and not `false`)
- stdout is not a TTY
- the CLI is being run by `npm` or `yarn`

## License

MIT
