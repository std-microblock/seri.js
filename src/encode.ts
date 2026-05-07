import type { RegisteredClass } from './types'
import { SeriUnsupportedValueError } from './errors'
import { SeriRegistry } from './registry'

const BUILTIN_KEY_SUFFIX = 'builtin'
const ID_SUFFIX = 'id'
const REF_SUFFIX = 'ref'
const VALUES_SUFFIX = 'values'
const ENTRIES_SUFFIX = 'entries'
const DATA_SUFFIX = 'data'

const BUILTIN_SET = 'Set'
const BUILTIN_MAP = 'Map'
const BUILTIN_UINT8ARRAY = 'Uint8Array'

export function encodeValue(value: unknown, registry: SeriRegistry, tagKey: string): unknown {
  const counts = new WeakMap<object, number>()
  const visited = new WeakSet<object>()
  const referenceIds = new WeakMap<object, number>()
  const encodedReferences = new WeakSet<object>()
  const builtinKey = `${tagKey}${BUILTIN_KEY_SUFFIX}`
  const idKey = `${tagKey}${ID_SUFFIX}`
  const refKey = `${tagKey}${REF_SUFFIX}`
  const valuesKey = `${tagKey}${VALUES_SUFFIX}`
  const builtinValuesKey = `${builtinKey}${tagKey}${VALUES_SUFFIX}`
  const builtinEntriesKey = `${builtinKey}${tagKey}${ENTRIES_SUFFIX}`
  const builtinDataKey = `${builtinKey}${tagKey}${DATA_SUFFIX}`
  let nextReferenceId = 1

  const inspect = (current: unknown): void => {
    if (current === null || typeof current !== 'object') {
      return
    }

    counts.set(current, (counts.get(current) ?? 0) + 1)
    if (visited.has(current)) {
      return
    }
    visited.add(current)

    if (Array.isArray(current)) {
      for (const item of current) {
        inspect(item)
      }
      return
    }

    if (current instanceof Set) {
      for (const item of current.values()) {
        inspect(item)
      }
      return
    }

    if (current instanceof Map) {
      for (const [key, value] of current.entries()) {
        inspect(key)
        inspect(value)
      }
      return
    }

    if (current instanceof Uint8Array) {
      return
    }

    const registered = registry.getByCtor(current)
    if (registered) {
      const source = registered.metadata.toPlain
        ? registered.metadata.toPlain(current)
        : (current as Record<string, unknown>)

      if (registered.metadata.toPlain) {
        for (const value of Object.values(source)) {
          inspect(value)
        }
        return
      }

      for (const [key, value] of Object.entries(source)) {
        const field = registered.metadata.fields.get(key)
        if (field?.omit) {
          continue
        }

        inspect(field?.codec ? field.codec.toPlain(value, current) : value)
      }
      return
    }

    for (const value of Object.values(current)) {
      inspect(value)
    }
  }

  const getReferenceId = (current: object): number => {
    const existing = referenceIds.get(current)
    if (existing) {
      return existing
    }

    const referenceId = nextReferenceId
    nextReferenceId += 1
    referenceIds.set(current, referenceId)
    return referenceId
  }

  inspect(value)

  const encode = (current: unknown): unknown => {
    if (current === null || typeof current === 'string' || typeof current === 'number' || typeof current === 'boolean') {
      return current
    }

    if (typeof current === 'function') {
      throw new SeriUnsupportedValueError('function')
    }

    if (typeof current !== 'object') {
      return current
    }

    const hasReferences = (counts.get(current) ?? 0) > 1
    if (hasReferences && encodedReferences.has(current)) {
      return { [refKey]: getReferenceId(current) }
    }

    if (Array.isArray(current)) {
      if (!hasReferences) {
        return current.map((item) => encode(item))
      }

      encodedReferences.add(current)
      const items = current.map((item) => encode(item))
      return {
        [idKey]: getReferenceId(current),
        [valuesKey]: items,
      }
    }

    if (current instanceof Set) {
      if (hasReferences) {
        encodedReferences.add(current)
      }
      return encodeBuiltinCollection(
        current,
        BUILTIN_SET,
        Array.from(current.values(), (item) => encode(item)),
        builtinKey,
        idKey,
        hasReferences ? getReferenceId(current) : undefined,
        encodedReferences,
        builtinValuesKey,
      )
    }

    if (current instanceof Map) {
      if (hasReferences) {
        encodedReferences.add(current)
      }
      return encodeBuiltinCollection(
        current,
        BUILTIN_MAP,
        Array.from(current.entries(), ([key, value]) => [encode(key), encode(value)]),
        builtinKey,
        idKey,
        hasReferences ? getReferenceId(current) : undefined,
        encodedReferences,
        builtinEntriesKey,
      )
    }

    if (current instanceof Uint8Array) {
      if (hasReferences) {
        encodedReferences.add(current)
      }
      return encodeBuiltinCollection(
        current,
        BUILTIN_UINT8ARRAY,
        Array.from(current),
        builtinKey,
        idKey,
        hasReferences ? getReferenceId(current) : undefined,
        encodedReferences,
        builtinDataKey,
      )
    }

    const registered = registry.getByCtor(current)
    if (registered) {
      return encodeRegistered(
        current as Record<string, unknown>,
        registered,
        encode,
        tagKey,
        hasReferences ? getReferenceId(current) : undefined,
        idKey,
        encodedReferences,
      )
    }

    if (Object.getPrototypeOf(current) !== Object.prototype && Object.getPrototypeOf(current) !== null) {
      throw new SeriUnsupportedValueError((current as { constructor?: { name?: string } }).constructor?.name ?? 'object')
    }

    const plain: Record<string, unknown> = {}
    if (hasReferences) {
      plain[idKey] = getReferenceId(current)
      encodedReferences.add(current)
    }

    for (const [key, item] of Object.entries(current)) {
      plain[key] = encode(item)
    }
    return plain
  }

  return encode(value)
}

function encodeRegistered(
  instance: Record<string, unknown>,
  registered: RegisteredClass,
  encode: (value: unknown) => unknown,
  tagKey: string,
  referenceId: number | undefined,
  idKey: string,
  encodedReferences: WeakSet<object>,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    [tagKey]: registered.tag,
  }

  if (referenceId !== undefined) {
    result[idKey] = referenceId
    encodedReferences.add(instance)
  }

  const source = registered.metadata.toPlain
    ? registered.metadata.toPlain(instance)
    : instance

  if (registered.metadata.toPlain) {
    for (const [key, value] of Object.entries(source)) {
      result[key] = encode(value)
    }
    return result
  }

  for (const [key, value] of Object.entries(source)) {
    const field = registered.metadata.fields.get(key)
    if (field?.omit) {
      continue
    }

    const nextValue = field?.codec ? field.codec.toPlain(value, instance) : value
    result[key] = encode(nextValue)
  }

  return result
}

function encodeBuiltinCollection(
  instance: object,
  builtinName: string,
  payload: unknown,
  builtinKey: string,
  idKey: string,
  referenceId: number | undefined,
  encodedReferences: WeakSet<object>,
  payloadKey = `${builtinKey}!${VALUES_SUFFIX}`,
): Record<string, unknown> {
  const result: Record<string, unknown> = {
    [builtinKey]: builtinName,
    [payloadKey]: payload,
  }

  if (referenceId !== undefined) {
    result[idKey] = referenceId
    encodedReferences.add(instance)
  }

  return result
}
