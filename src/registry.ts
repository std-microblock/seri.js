import { SeriDuplicateNameError, SeriTagCollisionError, SeriUnknownTagError } from './errors'
import { getClassMetadata } from './metadata'
import type { AnyRegisteredClass, Constructor, RegisteredClass, SeriClassOptions } from './types'

export class SeriRegistry {
  private readonly byCtor = new Map<Constructor, AnyRegisteredClass>()
  private readonly byName = new Map<string, AnyRegisteredClass>()
  private readonly byTag = new Map<number, AnyRegisteredClass>()

  constructor(
    private readonly hash: (value: string) => number,
  ) {}

  register<T extends object, TPlain extends Record<string, unknown> = Record<string, unknown>>(
    ctor: Constructor<T>,
    options?: SeriClassOptions<T, TPlain>,
  ): RegisteredClass<T, TPlain> {
    const existing = this.byCtor.get(ctor)
    if (existing) {
      return existing
    }

    const className = options?.name ?? ctor.name
    const duplicate = this.byName.get(className)
    if (duplicate) {
      throw new SeriDuplicateNameError(className)
    }

    const tag = this.hash(className)
    const collision = this.byTag.get(tag)
    if (collision) {
      throw new SeriTagCollisionError(tag, collision.className, className)
    }

    const metadata = getClassMetadata<T, TPlain>(ctor)
    if (options) {
      if (options.name) {
        metadata.name = options.name
      }
      if (options.strategy) {
        metadata.strategy = options.strategy
      }
      if (options.objectCreator) {
        metadata.objectCreator = options.objectCreator
      }
      if (options.afterDeserialize) {
        metadata.afterDeserialize = options.afterDeserialize
      }
      if (options.toPlain) {
        metadata.toPlain = options.toPlain
      }
      if (options.fromPlain) {
        metadata.fromPlain = options.fromPlain
      }
    }

    const registered: RegisteredClass<T, TPlain> = {
      ctor,
      className,
      tag,
      metadata,
    }

    this.byCtor.set(ctor, registered)
    this.byName.set(className, registered)
    this.byTag.set(tag, registered)

    return registered
  }

  getByCtor<T extends object, TPlain extends Record<string, unknown> = Record<string, unknown>>(value: T): RegisteredClass<T, TPlain> | undefined {
    return this.byCtor.get(value.constructor as Constructor)
  }

  create<T extends object>(ctor: Constructor<T>): T {
    const entry = this.byCtor.get(ctor)
    if (!entry) {
      return Object.create(ctor.prototype) as T
    }

    if (entry.metadata.objectCreator === 'ctor') {
      return new ctor()
    }

    if (typeof entry.metadata.objectCreator === 'function') {
      return entry.metadata.objectCreator()
    }

    return Object.create(ctor.prototype) as T
  }

  getByTag<T extends object = object, TPlain extends Record<string, unknown> = Record<string, unknown>>(tag: number): RegisteredClass<T, TPlain> {
    const entry = this.byTag.get(tag)
    if (!entry) {
      throw new SeriUnknownTagError(tag)
    }
    return entry
  }
}
