import type { AnyFieldCodec, ClassMetadata, Constructor, FieldMetadata, SeriClassOptions } from './types'

const metadataStore = new WeakMap<Function, ClassMetadata>()

function ensureClassMetadata(ctor: Function): ClassMetadata {
  let metadata = metadataStore.get(ctor)
  if (!metadata) {
    metadata = {
      strategy: 'include-all',
      objectCreator: 'noctor',
      fields: new Map<string, FieldMetadata>(),
    }
    metadataStore.set(ctor, metadata)
  }
  return metadata
}

export function setClassOptions(ctor: Function, options?: SeriClassOptions): ClassMetadata {
  const metadata = ensureClassMetadata(ctor)
  if (options?.name) {
    metadata.name = options.name
  }
  if (options?.strategy) {
    metadata.strategy = options.strategy
  }
  if (options?.objectCreator) {
    metadata.objectCreator = options.objectCreator
  }
  if (options?.afterDeserialize) {
    metadata.afterDeserialize = options.afterDeserialize
  }
  if (options?.toPlain) {
    metadata.toPlain = options.toPlain
  }
  if (options?.fromPlain) {
    metadata.fromPlain = options.fromPlain
  }
  return metadata
}

function ensureFieldMetadata(target: object, propertyKey: string): FieldMetadata {
  const ctor = (target as { constructor: Function }).constructor
  const metadata = ensureClassMetadata(ctor)
  let field = metadata.fields.get(propertyKey)
  if (!field) {
    field = {}
    metadata.fields.set(propertyKey, field)
  }
  return field
}

export function markFieldOmitted(target: object, propertyKey: string): void {
  const field = ensureFieldMetadata(target, propertyKey)
  field.omit = true
}

export function markFieldIncluded(target: object, propertyKey: string): void {
  const field = ensureFieldMetadata(target, propertyKey)
  field.include = true
}

export function setFieldDefault(target: object, propertyKey: string, value: unknown): void {
  const field = ensureFieldMetadata(target, propertyKey)
  field.include = true
  field.hasDefault = true
  field.defaultValue = value
}

export function setFieldCodec<TValue, TPlain>(
  target: object,
  propertyKey: string,
  codec: AnyFieldCodec,
): void {
  const field = ensureFieldMetadata(target, propertyKey)
  field.include = true
  field.codec = codec
}

export function getClassMetadata<T extends object>(ctor: Constructor<T>): ClassMetadata {
  const metadata = metadataStore.get(ctor)
  if (metadata) {
    return metadata
  }
  return {
    strategy: 'include-all',
    objectCreator: 'noctor',
    fields: new Map<string, FieldMetadata>(),
  }
}
