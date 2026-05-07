import { decodeValue } from './decode'
import { SeriTypeMismatchError } from './errors'
import { defaultHash } from './hash'
import { markFieldOmitted, setClassOptions, setFieldCodec } from './metadata'
import { SeriRegistry } from './registry'
import { encodeValue } from './encode'
import { jsonBufferSerializer } from './serializer'
import type { Constructor, SeriApi, SeriDecorator, SeriFactoryOptions } from './types'

export function makeSeri(options: SeriFactoryOptions = {}): SeriApi {
  const serializer = options.serializer ?? jsonBufferSerializer
  const tagKey = options.tagKey ?? '!'
  const registry = new SeriRegistry(options.hash ?? defaultHash)

  const seri = ((classOptions) => {
    return (target) => {
      setClassOptions(target as Function, classOptions)
      registry.register(target as unknown as Constructor, classOptions)
    }
  }) as SeriDecorator

  seri.omit = () => {
    return (target, propertyKey) => {
      markFieldOmitted(target, String(propertyKey))
    }
  }

  seri.codec = (toPlain, fromPlain) => {
    return (target, propertyKey) => {
      setFieldCodec(target, String(propertyKey), { toPlain, fromPlain })
    }
  }

  function toPlain(value: unknown): unknown {
    return encodeValue(value, registry, tagKey)
  }

  function fromPlain(value: unknown): unknown
  function fromPlain<T extends object>(value: unknown, clazz: Constructor<T>): T
  function fromPlain<T extends object>(value: unknown, clazz?: Constructor<T>): unknown {
    const decoded = decodeValue(value, registry, tagKey)
    if (!clazz) {
      return decoded
    }
    if (!(decoded instanceof clazz)) {
      const actual = decoded && typeof decoded === 'object' ? (decoded as { constructor?: { name?: string } }).constructor?.name ?? 'Object' : typeof decoded
      throw new SeriTypeMismatchError(clazz.name, actual)
    }
    return decoded
  }

  function to(value: unknown): ArrayBuffer {
    return serializer.serialize(toPlain(value))
  }

  function from(buffer: ArrayBuffer): unknown
  function from<T extends object>(buffer: ArrayBuffer, clazz: Constructor<T>): T
  function from<T extends object>(buffer: ArrayBuffer, clazz?: Constructor<T>): unknown {
    const value = serializer.deserialize(buffer)
    if (!clazz) {
      return fromPlain(value)
    }
    return fromPlain(value, clazz)
  }

  return {
    from,
    fromPlain,
    to,
    toPlain,
    seri,
  }
}
