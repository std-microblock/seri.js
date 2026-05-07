import { describe, expect, it } from 'vitest'

import { makeSeri } from '../src'

describe('integration', () => {
  it('serializes and deserializes a mixed object graph', () => {
    const { seri, toPlain, fromPlain, to, from } = makeSeri()

    class Money {
      constructor(public readonly cents: number) {}
    }

    @seri({ name: 'app/LineItem' })
    class LineItem {
      name = 'book'

      @seri.codec(
        (value: Money) => value.cents,
        (plain: number) => new Money(plain),
      )
      price = new Money(1999)
    }

    @seri()
    class Cart {
      items = [new LineItem()]
      coupon: string | null = null
      meta = { source: 'test' }

      @seri.omit()
      internal = 'hidden'
    }

    const input = new Cart()
    const sharedMeta = { source: 'test' }
    input.meta = sharedMeta
    input.items.push(input.items[0])

    expect(toPlain(input)).toEqual({
      '!': expect.any(Number),
      items: [
        {
          '!': expect.any(Number),
          '!id': 1,
          name: 'book',
          price: 1999,
        },
        { '!ref': 1 },
      ],
      coupon: null,
      meta: {
        source: 'test',
      },
    })

    const plainOutput = fromPlain(toPlain(input), Cart)
    const output = from(to(input), Cart)

    expect(plainOutput.items[0]).toBe(plainOutput.items[1])
    expect(output).toBeInstanceOf(Cart)
    expect(output.items[0]).toBeInstanceOf(LineItem)
    expect(output.items[0]).toBe(output.items[1])
    expect(output.items[0].price).toBeInstanceOf(Money)
    expect(output.items[0].price.cents).toBe(1999)
    expect(output.meta).toEqual({ source: 'test' })
    expect(output.internal).toBeUndefined()
  })

  it('round-trips a deep nested cyclic graph', () => {
    const { seri, toPlain, fromPlain } = makeSeri()

    @seri()
    class Leaf {
      label = 'leaf'
      next: Leaf | null = null
    }

    @seri()
    class Branch {
      name = 'branch'
      leaf = new Leaf()
      aliases = [this.leaf]
    }

    @seri()
    class Root {
      branch = new Branch()
      mirror = this.branch.leaf
      payload = {
        branch: this.branch,
        leaf: this.branch.leaf,
      }
    }

    const root = new Root()
    root.branch.leaf.next = root.branch.leaf

    const plain = toPlain(root)
    const restored = fromPlain(plain, Root)

    expect(restored.branch).toBeInstanceOf(Branch)
    expect(restored.branch.leaf).toBeInstanceOf(Leaf)
    expect(restored.branch.leaf).toBe(restored.branch.aliases[0])
    expect(restored.branch.leaf).toBe(restored.mirror)
    expect(restored.branch).toBe(restored.payload.branch)
    expect(restored.branch.leaf).toBe(restored.payload.leaf)
    expect(restored.branch.leaf.next).toBe(restored.branch.leaf)
  })

  it('round-trips deep nested shared plain-object references', () => {
    const { toPlain, fromPlain } = makeSeri()

    const shared = { value: 1 }
    const root = {
      a: {
        b: {
          c: shared,
        },
      },
      x: [shared, { nested: shared }],
      y: {
        z: {
          k: [shared],
        },
      },
    }

    const plain = toPlain(root)
    const restored = fromPlain(plain) as {
      a: { b: { c: { value: number } } }
      x: [{ value: number }, { nested: { value: number } }]
      y: { z: { k: [{ value: number }] } }
    }

    expect(restored.a.b.c).toBe(restored.x[0])
    expect(restored.a.b.c).toBe(restored.x[1].nested)
    expect(restored.a.b.c).toBe(restored.y.z.k[0])
  })
})
