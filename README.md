# seri.js

`seri.js` is a small TypeScript library for serializing and deserializing class instances with decorators.

It converts registered class instances into plain objects with a compact hash tag, then hands the result to a pluggable `ArrayBuffer` serializer.
During deserialization it restores prototypes with `Object.create()`, so constructors are not invoked.

## Features

- `makeSeri()` creates an isolated serializer instance
- `@seri()` registers classes for round-trip serialization
- `@seri.omit()` excludes a field from serialized output
- `@seri.codec()` defines custom field-level encode/decode logic
- hash-based class tags with collision checks at registration time
- shared references and self-references are preserved
- unregistered class instances and function values fail fast by default
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
- `to(value): ArrayBuffer`
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

If `name` is omitted, the class tag is derived from `class.name`.

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

So the default wire format is JSON stored in an `ArrayBuffer`.

You can replace it with MessagePack, CBOR, protobuf, or any custom format by providing:

```ts
interface BufferSerializer {
  serialize(value: unknown): ArrayBuffer
  deserialize(buffer: ArrayBuffer): unknown
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
