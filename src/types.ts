export type Constructor<T extends object = object> = new (...args: any[]) => T

export interface BufferSerializer {
  serialize(value: unknown): ArrayBuffer
  deserialize(buffer: ArrayBuffer): unknown
}

export interface SeriFactoryOptions {
  serializer?: BufferSerializer
  hash?: (value: string) => number
  tagKey?: string
}

export interface SeriClassOptions {
  name?: string
}

export interface FieldCodec<TValue = unknown, TPlain = unknown> {
  toPlain: (value: TValue, instance: object) => TPlain
  fromPlain: (plain: TPlain) => TValue
}

export type AnyFieldCodec = FieldCodec<any, any>

export interface FieldMetadata {
  omit?: boolean
  codec?: AnyFieldCodec
}

export interface ClassMetadata {
  name?: string
  fields: Map<string, FieldMetadata>
}

export interface RegisteredClass<T extends object = object> {
  ctor: Constructor<T>
  className: string
  tag: number
  metadata: ClassMetadata
}

export interface SeriDecorator {
  (options?: SeriClassOptions): ClassDecorator
  omit(): PropertyDecorator
  codec<TValue, TPlain>(
    toPlain: (value: TValue, instance: object) => TPlain,
    fromPlain: (plain: TPlain) => TValue,
  ): PropertyDecorator
}

export interface SeriApi {
  from(buffer: ArrayBuffer): unknown
  from<T extends object>(buffer: ArrayBuffer, clazz: Constructor<T>): T
  fromPlain(value: unknown): unknown
  fromPlain<T extends object>(value: unknown, clazz: Constructor<T>): T
  to(value: unknown): ArrayBuffer
  toPlain(value: unknown): unknown
  seri: SeriDecorator
}
