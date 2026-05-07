import { describe, expect, it } from 'vitest'

import { makeSeri, SeriDuplicateNameError, SeriTagCollisionError } from '../src'

describe('registration', () => {
  it('registers decorated classes and supports explicit names', () => {
    const { seri, toPlain } = makeSeri()

    @seri({ name: 'pkg/Foo' })
    class Foo {
      value = 1
    }

    expect(toPlain(new Foo())).toEqual({
      '!': expect.any(Number),
      value: 1,
    })
  })

  it('throws for duplicate class names', () => {
    const { seri } = makeSeri()

    @seri({ name: 'dup/Thing' })
    class FirstThing {}

    expect(() => {
      @seri({ name: 'dup/Thing' })
      class SecondThing {}

      return SecondThing
    }).toThrow(SeriDuplicateNameError)

    expect(FirstThing).toBeDefined()
  })

  it('throws for hash collisions', () => {
    const { seri } = makeSeri({ hash: () => 7 })

    @seri({ name: 'pkg/One' })
    class One {}

    expect(() => {
      @seri({ name: 'pkg/Two' })
      class Two {}

      return Two
    }).toThrow(SeriTagCollisionError)

    expect(One).toBeDefined()
  })

  it('keeps registries isolated per factory', () => {
    const first = makeSeri()
    const second = makeSeri()

    @first.seri()
    class Shared {
      value = 1
    }

    const encoded = first.to(new Shared())
    expect(() => second.from(encoded, Shared)).toThrow()
  })
})
