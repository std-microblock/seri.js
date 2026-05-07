import type { RegisteredClass } from './types'
import { SeriUnsupportedValueError } from './errors'
import { SeriRegistry } from './registry'

const ID_SUFFIX = 'id'
const REF_SUFFIX = 'ref'
const VALUES_SUFFIX = 'values'

export function encodeValue(value: unknown, registry: SeriRegistry, tagKey: string): unknown {
  const counts = new WeakMap<object, number>()
  const visited = new WeakSet<object>()
  const referenceIds = new WeakMap<object, number>()
  const encodedReferences = new WeakSet<object>()
  const idKey = `${tagKey}${ID_SUFFIX}`
  const refKey = `${tagKey}${REF_SUFFIX}`
  const valuesKey = `${tagKey}${VALUES_SUFFIX}`
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

    const registered = registry.getByCtor(current)
    if (registered) {
      for (const [key, value] of Object.entries(current)) {
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

  for (const [key, value] of Object.entries(instance)) {
    const field = registered.metadata.fields.get(key)
    if (field?.omit) {
      continue
    }

    const nextValue = field?.codec ? field.codec.toPlain(value, instance) : value
    result[key] = encode(nextValue)
  }

  return result
}
