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
  const instance = Object.create(entry.ctor.prototype) as object
  registerReference(value, instance, idKey, references)

  for (const [key, raw] of Object.entries(value)) {
    if (key === tagKey || key === idKey) {
      continue
    }

    const field = entry.metadata.fields.get(key)
    const decoded = decode(raw)
    ;(instance as Record<string, unknown>)[key] = field?.codec ? field.codec.fromPlain(decoded) : decoded
  }

  entry.metadata.afterDeserialize?.(instance)

  return instance
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
