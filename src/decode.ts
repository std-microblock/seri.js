import { encodeValue } from './encode'
import { SeriUnknownReferenceError } from './errors'
import { SeriRegistry } from './registry'

const ID_SUFFIX = 'id'
const REF_SUFFIX = 'ref'
const VALUES_SUFFIX = 'values'

function isTaggedObject(value: unknown, tagKey: string): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) && tagKey in value
}

export function decodeValue(value: unknown, registry: SeriRegistry, tagKey: string): unknown {
  const references = new Map<number, object>()
  const idKey = `${tagKey}${ID_SUFFIX}`
  const refKey = `${tagKey}${REF_SUFFIX}`
  const valuesKey = `${tagKey}${VALUES_SUFFIX}`

  const decode = (current: unknown): unknown => {
    if (current === null || typeof current !== 'object') {
      return current
    }

    if (Array.isArray(current)) {
      return current.map((item) => decode(item))
    }

    if (refKey in current) {
      const record = current as Record<string, unknown>
      const referenceId = record[refKey]
      const existing = references.get(referenceId as number)
      if (!existing) {
        throw new SeriUnknownReferenceError(referenceId as number)
      }
      return existing
    }

    if (valuesKey in current) {
      return decodeArrayWrapper(current as Record<string, unknown>, decode, idKey, valuesKey, references)
    }

    if (isTaggedObject(current, tagKey)) {
      return decodeRegistered(current as Record<string, unknown>, registry, tagKey, decode, idKey, references)
    }

    const record = current as Record<string, unknown>
    const plain: Record<string, unknown> = {}
    registerReference(record, plain, idKey, references)

    for (const [key, item] of Object.entries(record)) {
      if (key === idKey) {
        continue
      }
      plain[key] = decode(item)
    }
    return plain
  }

  return decode(value)
}

function decodeRegistered(
  value: Record<string, unknown>,
  registry: SeriRegistry,
  tagKey: string,
  decode: (value: unknown) => unknown,
  idKey: string,
  references: Map<number, object>,
): object {
  const tag = value[tagKey]
  const entry = registry.getByTag(tag as number)
  const source = { ...value }
  delete source[tagKey]
  delete source[idKey]

  if (entry.metadata.fromPlain) {
    const decodedSource: Record<string, unknown> = {}
    for (const [key, raw] of Object.entries(source)) {
      decodedSource[key] = decode(raw)
    }
    const instance = entry.metadata.fromPlain(decodedSource)
    registerReference(value, instance, idKey, references)
    applyDefaults(instance, entry.metadata.fields, registry, tagKey)
    entry.metadata.afterDeserialize?.(instance)
    return instance
  }

  const instance = createInstance(entry, source)
  registerReference(value, instance, idKey, references)

  for (const [key, raw] of Object.entries(value)) {
    if (key === tagKey || key === idKey) {
      continue
    }

    const field = entry.metadata.fields.get(key)
    const decoded = decode(raw)
    ;(instance as Record<string, unknown>)[key] = field?.codec ? field.codec.fromPlain(decoded) : decoded
  }

  applyDefaults(instance, entry.metadata.fields, registry, tagKey)
  entry.metadata.afterDeserialize?.(instance)

  return instance
}

function createInstance(
  entry: ReturnType<SeriRegistry['getByTag']>,
  source: Record<string, unknown>,
): object {
  if (entry.metadata.objectCreator === 'ctor') {
    return new entry.ctor()
  }

  if (typeof entry.metadata.objectCreator === 'function') {
    return entry.metadata.objectCreator()
  }

  return Object.create(entry.ctor.prototype) as object
}

function applyDefaults(
  instance: object,
  fields: Map<string, { hasDefault?: boolean, defaultValue?: unknown }>,
  registry: SeriRegistry,
  tagKey: string,
): void {
  const target = instance as Record<string, unknown>
  for (const [key, field] of fields.entries()) {
    if (!field.hasDefault || key in target) {
      continue
    }
    target[key] = cloneDefaultValue(field.defaultValue, registry, tagKey)
  }
}

function cloneDefaultValue<T>(value: T, registry: SeriRegistry, tagKey: string): T {
  if (value === null || typeof value !== 'object') {
    return value
  }
  return decodeValue(encodeValue(value, registry, tagKey), registry, tagKey) as T
}

function decodeArrayWrapper(
  value: Record<string, unknown>,
  decode: (value: unknown) => unknown,
  idKey: string,
  valuesKey: string,
  references: Map<number, object>,
): unknown[] {
  const result: unknown[] = []
  registerReference(value, result, idKey, references)

  const rawValues = value[valuesKey]
  if (!Array.isArray(rawValues)) {
    return result
  }

  for (const item of rawValues) {
    result.push(decode(item))
  }

  return result
}

function registerReference(
  source: Record<string, unknown>,
  target: object,
  idKey: string,
  references: Map<number, object>,
): void {
  const referenceId = source[idKey]
  if (typeof referenceId === 'number') {
    references.set(referenceId, target)
  }
}
