import type { AnyFieldCodec, ClassMetadata, Constructor, FieldMetadata, SeriClassOptions } from './types'

const metadataStore = new WeakMap<Function, ClassMetadata>()

function ensureClassMetadata(ctor: Function): ClassMetadata {
  let metadata = metadataStore.get(ctor)
  if (!metadata) {
    metadata = {
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

export function setFieldCodec<TValue, TPlain>(
  target: object,
  propertyKey: string,
  codec: AnyFieldCodec,
): void {
  const field = ensureFieldMetadata(target, propertyKey)
  field.codec = codec
}

export function getClassMetadata<T extends object>(ctor: Constructor<T>): ClassMetadata {
  const metadata = metadataStore.get(ctor)
  if (metadata) {
    return metadata
  }
  return {
    fields: new Map<string, FieldMetadata>(),
  }
}
