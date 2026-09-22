# nano-notifier 🔔

Notifies users of your CLI when an update is available.

```
┌────────────────────────────────────────┐
│                                        │
│      Update available 1.0.0 → 1.2.0    │
│    Run npm i -g my-cli to update       │
│                                        │
└────────────────────────────────────────┘
```

## Install

```sh
npm i nano-notifier
```

## Usage

```js
import { notifier } from 'nano-notifier';

const instance = notifier({
  name: 'my-cli',
  version: '1.0.0',
});

instance.notify();
```

The version check runs in a detached background process to avoid slowing
down your main thread. The result is displayed on the next run if a new
version is available.

## Options

| Option     | Type     | Default    | Description                            |
| ---------- | -------- | ---------- | -------------------------------------- |
| `name`     | `string` | –          | Package name to check on the registry  |
| `version`  | `string` | –          | Currently installed version            |
| `distTag`  | `string` | `latest`   | Dist tag to check against              |
| `interval` | `number` | 1 day (ms) | How often to check for a new version   |

### `notify(options?)`

By default the notification is rendered when your process exits. Pass
`defer: false` to render it immediately.

```js
instance.notify({
  defer: false,
  title: 'my-cli',
  message: 'A shiny new version is out!',
});
```

| Option       | Type      | Default | Description                              |
| ------------ | --------- | ------- | ---------------------------------------- |
| `message`    | `string`  | –       | Replaces the default update text         |
| `title`      | `string`  | –       | Title shown in the top border of the box |
| `defer`      | `boolean` | `true`  | Render on exit rather than immediately   |
| `boxOptions` | `object`  | –       | Styling for the underlying box           |

Styling is done via `boxOptions`, which is passed straight to the underlying
[`@clack/prompts`](https://github.com/bombshell-dev/clack) box (`width`,
`rounded`, `contentAlign`, `formatBorder`, and so on).

```js
instance.notify({
  boxOptions: {
    rounded: false,
    width: 60,
  },
});
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
