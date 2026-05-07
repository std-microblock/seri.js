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

  it('round-trips nested Set, Map and Uint8Array values with shared references', () => {
    const { seri, toPlain, fromPlain } = makeSeri()

    @seri()
    class Packet {
      bytes = new Uint8Array([1, 2, 3])
    }

    const packet = new Packet()
    const shared = { packet }
    const map = new Map<any, any>([[packet.bytes, new Set([shared, packet])]])

    const input = {
      packet,
      list: [packet.bytes, packet.bytes],
      map,
      shared,
    }

    const plain = toPlain(input)
    const restored = fromPlain(plain) as {
      packet: Packet
      list: [Uint8Array, Uint8Array]
      map: Map<Uint8Array, Set<unknown>>
      shared: { packet: Packet }
    }

    expect(restored.packet).toBeInstanceOf(Packet)
    expect(restored.packet.bytes).toBeInstanceOf(Uint8Array)
    expect(restored.list[0]).toBe(restored.list[1])
    expect(restored.list[0]).toBe(restored.packet.bytes)
    expect(restored.shared.packet).toBe(restored.packet)

    const [mapKey] = Array.from(restored.map.keys())
    expect(mapKey).toBe(restored.packet.bytes)

    const [mapValue] = Array.from(restored.map.values())
    expect(mapValue).toBeInstanceOf(Set)
    expect(Array.from(mapValue)).toContain(restored.packet)
    expect(Array.from(mapValue)).toContain(restored.shared)
  })
})
