export type Constructor<T extends object = object> = new (...args: any[]) => T

export interface BufferSerializer {
  serialize(value: unknown): ArrayBufferLike
  deserialize(buffer: ArrayBufferLike): unknown
}

export interface SeriFactoryOptions {
  serializer?: BufferSerializer
  hash?: (value: string) => number
  tagKey?: string
}

export interface SeriClassOptions {
  name?: string
  strategy?: 'include-all' | 'omit-all'
  objectCreator?: 'noctor' | 'ctor' | (() => object)
  afterDeserialize?: (instance: object) => void
  toPlain?: (instance: object) => Record<string, unknown>
  fromPlain?: (plain: Record<string, unknown>, instance?: object) => object
}

export interface FieldCodec<TValue = unknown, TPlain = unknown> {
  toPlain: (value: TValue, instance: object) => TPlain
  fromPlain: (plain: TPlain) => TValue
}

export type AnyFieldCodec = FieldCodec<any, any>

export interface FieldMetadata {
  include?: boolean
  omit?: boolean
  codec?: AnyFieldCodec
  hasDefault?: boolean
  defaultValue?: unknown
}

export interface ClassMetadata {
  name?: string
  strategy: 'include-all' | 'omit-all'
  objectCreator: 'noctor' | 'ctor' | (() => object)
  afterDeserialize?: (instance: object) => void
  toPlain?: (instance: object) => Record<string, unknown>
  fromPlain?: (plain: Record<string, unknown>, instance?: object) => object
  fields: Map<string, FieldMetadata>
}

export interface RegisteredClass<T extends object = object> {
  ctor: Constructor<T>
  className: string
  tag: number
  metadata: ClassMetadata
}

export interface SeriInstance {
  seriTo(): ArrayBufferLike
}

export interface SeriDecorator {
  (options?: SeriClassOptions): ClassDecorator
  include(): PropertyDecorator
  omit(): PropertyDecorator
  default(value: unknown): PropertyDecorator
  codec<TValue, TPlain>(
    toPlain: (value: TValue, instance: object) => TPlain,
    fromPlain: (plain: TPlain) => TValue,
  ): PropertyDecorator
}

export interface SeriApi {
  from(buffer: ArrayBufferLike): unknown
  from<T extends object>(buffer: ArrayBufferLike, clazz: Constructor<T>): T
  fromPlain(value: unknown): unknown
  fromPlain<T extends object>(value: unknown, clazz: Constructor<T>): T
  to(value: unknown): ArrayBufferLike
  toPlain(value: unknown): unknown
  seri: SeriDecorator
}
