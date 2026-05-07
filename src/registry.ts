import { SeriDuplicateNameError, SeriTagCollisionError, SeriUnknownTagError } from './errors'
import { getClassMetadata } from './metadata'
import type { Constructor, RegisteredClass, SeriClassOptions } from './types'

export class SeriRegistry {
  private readonly byCtor = new Map<Constructor, RegisteredClass>()
  private readonly byName = new Map<string, RegisteredClass>()
  private readonly byTag = new Map<number, RegisteredClass>()

  constructor(
    private readonly hash: (value: string) => number,
  ) {}

  register<T extends object>(ctor: Constructor<T>, options?: SeriClassOptions): RegisteredClass<T> {
    const existing = this.byCtor.get(ctor)
    if (existing) {
      return existing as RegisteredClass<T>
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

    const metadata = getClassMetadata(ctor)
    if (options?.name) {
      metadata.name = options.name
    }

    const registered: RegisteredClass<T> = {
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

  getByCtor(value: object): RegisteredClass | undefined {
    return this.byCtor.get(value.constructor as Constructor)
  }

  getByTag(tag: number): RegisteredClass {
    const entry = this.byTag.get(tag)
    if (!entry) {
      throw new SeriUnknownTagError(tag)
    }
    return entry
  }
}
