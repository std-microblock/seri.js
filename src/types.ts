export type Constructor<T extends object = object> = new (...args: any[]) => T

export interface WireSerializer<TWire = string> {
  serialize(value: unknown): TWire
  deserialize(buffer: TWire): unknown
}

export interface SeriFactoryOptions<TWire = string> {
  serializer?: WireSerializer<TWire>
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

export interface SeriInstance<TWire = string> {
  seriTo(): TWire
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

export interface SeriApi<TWire = string> {
  from(buffer: TWire): unknown
  from<T extends object>(buffer: TWire, clazz: Constructor<T>): T
  fromPlain(value: unknown): unknown
  fromPlain<T extends object>(value: unknown, clazz: Constructor<T>): T
  to(value: unknown): TWire
  toPlain(value: unknown): unknown
  seri: SeriDecorator
}
