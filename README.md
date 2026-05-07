# seri.js

`seri.js` is a small TypeScript library for serializing and deserializing class instances with decorators.

It converts registered class instances into plain objects with a compact hash tag, then hands the result to a pluggable `ArrayBufferLike` serializer.
During deserialization it restores prototypes with `Object.create()`, so constructors are not invoked.

## Features

- `makeSeri()` creates an isolated serializer instance
- `@seri()` registers classes for round-trip serialization
- `@seri.omit()` excludes a field from serialized output
- `@seri.include()` explicitly includes a field when using omit-all strategy
- `@seri.default(value)` supplies a deserialization default for missing fields
- `@seri.codec()` defines custom field-level encode/decode logic
- hash-based class tags with collision checks at registration time
- shared references and self-references are preserved
- unregistered class instances and function values fail fast by default
- auto-registered built-in support for `Set`, `Map`, `Uint8Array`, `ArrayBuffer`, and Node `Buffer`
- optional class-level `toPlain` / `fromPlain` handlers in `@seri(...)`
- `from(buffer, Class)` adds runtime type validation

## Install

```bash
yarn add seri.js
```

## Quick Start

```ts
import { makeSeri } from 'seri.js'

const { seri, to, from } = makeSeri()

class Money {
  constructor(public readonly cents: number) {}
}

@seri()
class Item {
  name = 'book'

  @seri.codec(
    (value: Money) => value.cents,
    (plain: number) => new Money(plain),
  )
  price = new Money(1999)
}

@seri({ name: 'app/Cart' })
class Cart {
  items = [new Item()]

  @seri.omit()
  internalNote = 'hidden'
}

const input = new Cart()
const buffer = to(input)
const output = from(buffer, Cart)

console.log(output instanceof Cart)
console.log(output.items[0] instanceof Item)
console.log(output.items[0].price instanceof Money)
```

## API

### `makeSeri(options?)`

```ts
const { seri, toPlain, to, fromPlain, from } = makeSeri({
  serializer,
  hash,
  tagKey: '!',
})
```

Options:

- `serializer?: BufferSerializer`
- `hash?: (value: string) => number`
- `tagKey?: string`

Returns:

- `toPlain(value): unknown`
- `to(value): ArrayBufferLike`
- `fromPlain(value): unknown`
- `fromPlain(value, Class): Class`
- `from(buffer): unknown`
- `from(buffer, Class): Class`
- `seri`: decorator API

### `@seri(options?)`

Registers a class in the current `makeSeri()` instance.

```ts
@seri()
class User {}

@seri({ name: 'app/User' })
class NamedUser {}
```

Options:

- `name?: string`
- `strategy?: 'include-all' | 'omit-all'`
- `objectCreator?: 'noctor' | 'ctor' | (() => object)`

If `name` is omitted, the class tag is derived from `class.name`.

`strategy` defaults to `include-all`. If you set `omit-all`, only fields marked with `@seri.include()`, `@seri.default(...)`, or another field decorator that implies inclusion are serialized.

`objectCreator` controls how instances are created during deserialization:

- `'noctor'`: `Object.create(prototype)`
- `'ctor'`: `new Class()`
- `() => object`: custom factory

Registered classes can also define custom payload handlers in decorator options:

```ts
@seri({
  toPlain: (instance) => {
    const point = instance as Point
    return { packed: [point.x, point.y] }
  },
  fromPlain: (plain) => {
    const point = Object.create(Point.prototype) as Point
    ;[point.x, point.y] = plain.packed
    return point
  },
})
class Point {
  x = 1
  y = 2
}
```

If present, `toPlain` is used instead of enumerating instance fields, and `fromPlain` is used instead of the default field assignment path.

Every decorated instance also receives a non-enumerable helper method:

```ts
const buffer = instance.seriTo()
```

It is equivalent to calling the serializer instance's `to(instance)`.

### `@seri.omit()`

Excludes a field from serialized output.

```ts
@seri()
class SecretBox {
  visible = 'ok'

  @seri.omit()
  hidden = 'secret'
}
```

During deserialization, omitted fields stay absent unless they are present in the serialized input.

`omit` is also the escape hatch for unsupported runtime values like functions that should not be serialized.

### `@seri.include()`

Marks a field for serialization when the class uses `@seri({ strategy: 'omit-all' })`.

```ts
@seri({ strategy: 'omit-all' })
class User {
  @seri.include()
  id = 1

  name = 'hidden'
}
```

### `@seri.default(value)`

Supplies a default value when a serialized field is missing during deserialization.

```ts
@seri()
class Config {
  @seri.default(123)
  retries!: number
}
```

This is roughly equivalent to a default initializer for deserialization purposes, but the value is tracked in metadata. Object defaults are cloned per instance, so they are not shared between deserialized objects. If the default value is not serializable by the current `seri` instance, decoration throws immediately.

### `@seri.codec(toPlain, fromPlain)`

Defines custom serialization logic for a single field.

```ts
@seri()
class Session {
  @seri.codec(
    (token: Token) => ({ raw: token.value }),
    (plain: { raw: string }) => new Token(plain.raw),
  )
  token = new Token('abc')
}
```

Use this for types like `Date`, `Map`, `Set`, custom value objects, or third-party classes that are not registered with `@seri()`.

If a class instance is not registered and not transformed by `@seri.codec()`, serialization throws instead of silently flattening it.

## Built-in Types

The following runtime types are supported without custom codecs:

- `Set`
- `Map`
- `Uint8Array`
- `ArrayBuffer`
- Node `Buffer`

They are auto-registered internally, so they use the same tag/registry pipeline as normal seri classes. They preserve shared references and can be nested inside registered classes, arrays, plain objects, and each other.

## Serialization Model

Registered instances are converted to plain objects and receive a tag field.

```ts
{ a: 1, "!": 1234567890 }
```

The tag value is a hash of either:

- the explicit `@seri({ name })` value, or
- the class name

Nested registered instances are tagged recursively.

When the same object is referenced multiple times, `seri.js` emits internal reference markers so identity can be restored during deserialization.

Example shape:

```ts
{
  left: { "!id": 1, value: 1 },
  right: { "!ref": 1 }
}
```

This also applies to self-references and cyclic graphs.

## Default Serializer

The built-in serializer uses:

- `JSON.stringify()` / `JSON.parse()`
- `TextEncoder` / `TextDecoder`

So the default wire format is JSON stored in an `ArrayBufferLike`.

You can replace it with MessagePack, CBOR, protobuf, or any custom format by providing:

```ts
interface BufferSerializer {
  serialize(value: unknown): ArrayBufferLike
  deserialize(buffer: ArrayBufferLike): unknown
}
```

## MobX

MobX compatibility depends on which MobX shape you serialize.

### Observable plain objects and arrays

These usually work without extra configuration because their runtime shape remains plain-object-like or array-like.

```ts
import { observable } from 'mobx'
import { toPlain, fromPlain } from 'seri.js'

const state = observable({ count: 1, nested: { ok: true } })
const plain = toPlain(state)
const restored = fromPlain(plain)
```

### Observable fields with `toJS`

If you want a field to always serialize as a detached plain object, use a field codec.

```ts
import { observable, toJS } from 'mobx'

@seri()
class Holder {
  @seri.codec(
    (value) => toJS(value),
    (plain) => observable(plain),
  )
  state = observable({ count: 1 })
}
```

### `makeAutoObservable(this)` class stores

Because `seri.js` restores instances with `Object.create()` and does not call the constructor, MobX class stores need an explicit reinitialization hook.

```ts
import { makeAutoObservable } from 'mobx'

@seri({
  afterDeserialize: (instance) => {
    makeAutoObservable(instance)
  },
})
class CounterStore {
  count = 1

  constructor() {
    makeAutoObservable(this)
  }
}
```

Without that hook, the prototype is restored but MobX observability is not.

## Errors

The library throws specific errors for common failure modes.

- `SeriDuplicateNameError`: two registered classes resolve to the same name
- `SeriTagCollisionError`: two names hash to the same tag
- `SeriUnknownTagError`: deserialization found an unregistered tag
- `SeriTypeMismatchError`: `from(buffer, Class)` received a different runtime type
- `SeriUnknownReferenceError`: deserialization found a missing reference target
- `SeriUnsupportedValueError`: serialization encountered an unsupported runtime value

## Limitations

- `objectCreator` defaults to `'noctor'`, so constructors are not called during deserialization unless you opt in
- class field initializers are not re-run during deserialization unless you use `objectCreator: 'ctor'`
- only registered classes restore their prototype automatically
- unregistered class instances must be registered or handled by `@seri.codec()`
- function values must be omitted or transformed before serialization
- MobX class stores that rely on constructor-time setup should use `afterDeserialize` or `objectCreator: 'ctor'`
- default JSON serialization follows normal JSON behavior for unsupported values like `undefined`, functions, and symbols

## Development

```bash
yarn install
yarn check
yarn test
yarn build
```

## CI

GitHub Actions workflows included in this repository:

- `ci.yml`: runs on pushes to `main` and all pull requests
- `publish.yml`: publishes to npm when pushing a tag matching `v*`

The publish workflow expects an `NPM_TOKEN` repository secret.

Example release flow:

```bash
git tag v0.1.0
git push origin v0.1.0
```
