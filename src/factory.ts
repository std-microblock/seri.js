import { decodeValue } from './decode'
import { SeriTypeMismatchError } from './errors'
import { defaultHash } from './hash'
import { markFieldIncluded, markFieldOmitted, setClassOptions, setFieldCodec, setFieldDefault } from './metadata'
import { SeriRegistry } from './registry'
import { encodeValue } from './encode'
import { jsonStringSerializer } from './serializer'
import type { Constructor, SeriApi, SeriClassOptions, SeriDecorator, SeriFactoryOptions, SeriInstance } from './types'

export function makeSeri<TWire = string>(options: SeriFactoryOptions<TWire> = {}): SeriApi<TWire> {
  const serializer = (options.serializer ?? jsonStringSerializer) as NonNullable<SeriFactoryOptions<TWire>['serializer']>
  const tagKey = options.tagKey ?? '!'
  const registry = new SeriRegistry(options.hash ?? defaultHash)

  registerBuiltins(registry)

  const seri = ((classOptions) => {
    return (target) => {
      const ctor = target as unknown as Constructor<any>
      const options = classOptions as SeriClassOptions<any, any> | undefined
      setClassOptions(ctor, options)
      defineSeriTo(target as unknown as Constructor)
      registry.register(ctor, options)
    }
  }) as SeriDecorator

  function defineSeriTo(target: Constructor): void {
    const prototype = target.prototype as SeriInstance<TWire> & Record<string, unknown>
    if (Object.prototype.hasOwnProperty.call(prototype, 'seriTo')) {
      return
    }
    Object.defineProperty(prototype, 'seriTo', {
      value: function seriTo(this: object): TWire {
        return to(this)
      },
      enumerable: false,
      configurable: true,
      writable: true,
    })
  }

  function defineRuntimeDefault(target: object, propertyKey: string, value: unknown): void {
    const existing = Object.getOwnPropertyDescriptor(target, propertyKey)
    if (existing && !existing.configurable) {
      return
    }

    Object.defineProperty(target, propertyKey, {
      get(this: object): unknown {
        const own = Object.getOwnPropertyDescriptor(this, propertyKey)
        if (own && 'value' in own) {
          return own.value
        }

        const cloned = cloneRuntimeDefault(value)
        Object.defineProperty(this, propertyKey, {
          value: cloned,
          enumerable: true,
          configurable: true,
          writable: true,
        })
        return cloned
      },
      set(this: object, next: unknown): void {
        Object.defineProperty(this, propertyKey, {
          value: next,
          enumerable: true,
          configurable: true,
          writable: true,
        })
      },
      enumerable: false,
      configurable: true,
    })
  }

  function cloneRuntimeDefault<T>(value: T): T {
    if (value === null || typeof value !== 'object') {
      return value
    }
    return decodeValue(encodeValue(value, registry, tagKey), registry, tagKey) as T
  }

  seri.omit = () => {
    return (target, propertyKey) => {
      markFieldOmitted(target, String(propertyKey))
    }
  }

  seri.include = () => {
    return (target, propertyKey) => {
      markFieldIncluded(target, String(propertyKey))
    }
  }

  seri.default = (value) => {
    return (target, propertyKey) => {
      const key = String(propertyKey)
      decodeValue(encodeValue(value, registry, tagKey), registry, tagKey)
      setFieldDefault(target, key, value)
      defineRuntimeDefault(target, key, value)
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

  function to(value: unknown): TWire {
    return serializer.serialize(toPlain(value))
  }

  function from(buffer: TWire): unknown
  function from<T extends object>(buffer: TWire, clazz: Constructor<T>): T
  function from<T extends object>(buffer: TWire, clazz?: Constructor<T>): unknown {
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
    registry
  }
}

function registerBuiltins(registry: SeriRegistry): void {
  registry.register(Set as unknown as Constructor<Set<unknown>>, {
    name: '@@seri/builtin/Set',
    objectCreator: 'ctor',
    toPlain: (instance) => ({ values: Array.from((instance as Set<unknown>).values()) }),
    fromPlain: (plain) => {
      const result = new Set<unknown>()
      for (const item of (plain.values as unknown[]) ?? []) {
        result.add(item)
      }
      return result
    },
  })

  registry.register(Map as unknown as Constructor<Map<unknown, unknown>>, {
    name: '@@seri/builtin/Map',
    objectCreator: 'ctor',
    toPlain: (instance) => ({ entries: Array.from((instance as Map<unknown, unknown>).entries()) }),
    fromPlain: (plain) => {
      const result = new Map<unknown, unknown>()
      for (const [key, value] of (plain.entries as [unknown, unknown][]) ?? []) {
        result.set(key, value)
      }
      return result
    },
  })

  registry.register(Uint8Array as unknown as Constructor<Uint8Array>, {
    name: '@@seri/builtin/Uint8Array',
    objectCreator: () => new Uint8Array(),
    toPlain: (instance) => ({ data: Array.from(instance as Uint8Array) }),
    fromPlain: (plain) => new Uint8Array((plain.data as number[]) ?? []),
  })

  registry.register(ArrayBuffer as unknown as Constructor<ArrayBuffer>, {
    name: '@@seri/builtin/ArrayBuffer',
    objectCreator: () => new ArrayBuffer(0),
    toPlain: (instance) => ({ data: Array.from(new Uint8Array(instance as ArrayBuffer)) }),
    fromPlain: (plain) => Uint8Array.from((plain.data as number[]) ?? []).buffer,
  })

  const nodeBuffer = (globalThis as { Buffer?: { new(...args: any[]): object; alloc(size: number): object; from(data: number[]): object } }).Buffer

  if (nodeBuffer) {
    registry.register(nodeBuffer as unknown as Constructor<object>, {
      name: '@@seri/builtin/Buffer',
      objectCreator: () => nodeBuffer.alloc(0),
      toPlain: (instance) => ({ data: Array.from(instance as ArrayLike<number>) }),
      fromPlain: (plain) => nodeBuffer.from((plain.data as number[]) ?? []),
    })
  }
}
