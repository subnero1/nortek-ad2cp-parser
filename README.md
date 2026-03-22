# Nortek AD2CP Parser

Parse Nortek AD2CP files in JavaScript.

See [nortek-ad2cp-reader](https://github.com/subnero1/nortek-ad2cp-reader) for a UI wrapper around this.

## Installation

```bash
pnpm install https://github.com/subnero1/nortek-ad2cp-parser
```

This package is currently not registered on npm.

## Usage

```js
import { parseAd2cp } from 'nortek-ad2cp-parser'
import fsPromises from 'node:fs/promises'

const data = parseAd2cp(await fsPromises.readFile(...))
```
