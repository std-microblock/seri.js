import { describe, expect, it } from 'vitest'

import { makeSeri, SeriTypeMismatchError, SeriUnknownReferenceError, SeriUnknownTagError, SeriUnsupportedValueError } from '../src'

describe('decode', () => {
  it('restores decorated instances', () => {
    const { seri, to, from } = makeSeri()

    @seri()
    class User {
      id = 1
    }

    const value = from(to(new User()), User)
    expect(value).toBeInstanceOf(User)
    expect(value.id).toBe(1)
  })

  it('restores nested instances', () => {
    const { seri, to, from } = makeSeri()

    @seri()
    class Child {
      value = 2
    }

    @seri()
    class Parent {
      child = new Child()
      list = [new Child()]
    }

    const value = from(to(new Parent()), Parent)
    expect(value.child).toBeInstanceOf(Child)
    expect(value.list[0]).toBeInstanceOf(Child)
  })

  it('restores codec fields', () => {
    const { seri, to, from } = makeSeri()

    class Token {
      constructor(public readonly raw: string) {}
    }

    @seri()
    class Session {
      @seri.codec(
        (value: Token) => ({ token: value.raw }),
        (plain: { token: string }) => new Token(plain.token),
      )
      token = new Token('abc')
    }

    const value = from(to(new Session()), Session)
    expect(value.token).toBeInstanceOf(Token)
    expect(value.token.raw).toBe('abc')
  })

  it('keeps constructor defaults for missing fields', () => {
    const { seri, toPlain, fromPlain } = makeSeri()

    @seri()
    class Config {
      mode = 'safe'
      retries = 3
    }

    const encoded = toPlain(new Config()) as Record<string, unknown>
    delete encoded.retries

    const value = fromPlain(encoded, Config)

    expect(value.mode).toBe('safe')
    expect(value.retries).toBeUndefined()
  })

  it('applies field defaults for missing properties', () => {
    const { seri, fromPlain, toPlain } = makeSeri()

    @seri()
    class Defaults {
      @seri.default(123)
      count!: number
    }

    const tag = (toPlain(Object.create(Defaults.prototype)) as Record<string, unknown>)['!'] as number
    const value = fromPlain({ '!': tag }, Defaults)
    expect(value.count).toBe(123)
  })

  it('throws for unsupported class defaults at decoration time', () => {
    const { seri } = makeSeri()

    class NotRegistered {
      value = 1
    }

    expect(() => {
      @seri()
      class Broken {
        @seri.default(new NotRegistered())
        child!: NotRegistered
      }

      return Broken
    }).toThrow(SeriUnsupportedValueError)
  })

  it('clones object defaults instead of sharing the same reference', () => {
    const { seri, fromPlain, toPlain } = makeSeri()

    @seri()
    class WithDefaultObject {
      @seri.default({ items: [] as string[] })
      state!: { items: string[] }
    }

    const first = fromPlain(toPlain(Object.create(WithDefaultObject.prototype)), WithDefaultObject)
    const second = fromPlain(toPlain(Object.create(WithDefaultObject.prototype)), WithDefaultObject)

    first.state.items.push('x')
    expect(second.state.items).toEqual([])
    expect(first.state).not.toBe(second.state)
  })

  it('injects runtime defaults onto normal new instances', () => {
    const { seri } = makeSeri()

    @seri()
    class RuntimeDefaults {
      @seri.default(new Map<string, number>())
      cache!: Map<string, number>
    }

    const first = new RuntimeDefaults()
    const second = new RuntimeDefaults()

    expect(first.cache).toBeInstanceOf(Map)
    expect(second.cache).toBeInstanceOf(Map)
    expect(first.cache).not.toBe(second.cache)

    first.cache.set('a', 1)
    expect(second.cache.has('a')).toBe(false)
  })

  it('clones registered class defaults instead of sharing the same reference', () => {
    const { seri, fromPlain, toPlain } = makeSeri()

    @seri()
    class ChildDefault {
      value = 1
    }

    @seri()
    class WithClassDefault {
      @seri.default(new ChildDefault())
      child!: ChildDefault
    }

    const first = fromPlain(toPlain(Object.create(WithClassDefault.prototype)), WithClassDefault)
    const second = fromPlain(toPlain(Object.create(WithClassDefault.prototype)), WithClassDefault)

    expect(first.child).toBeInstanceOf(ChildDefault)
    expect(second.child).toBeInstanceOf(ChildDefault)
    expect(first.child).not.toBe(second.child)

    first.child.value = 9
    expect(second.child.value).toBe(1)
  })

  it('does not require calling the constructor during deserialization', () => {
    const { seri, toPlain, fromPlain } = makeSeri()

    @seri()
    class RequiresArgs {
      label: string

      constructor(label: string) {
        if (!label) {
          throw new Error('constructor should not be called')
        }
        this.label = label
      }
    }

    const plain = toPlain({ '!': 0, label: 'x' })
    expect(plain).toEqual({ '!': 0, label: 'x' })

    const encoded = toPlain(Object.assign(Object.create(RequiresArgs.prototype) as RequiresArgs, { label: 'ok' }))
    const value = fromPlain(encoded, RequiresArgs)
    expect(value).toBeInstanceOf(RequiresArgs)
    expect(value.label).toBe('ok')
  })

  it('supports objectCreator: ctor', () => {
    const { seri, fromPlain, toPlain } = makeSeri()

    @seri({ objectCreator: 'ctor' })
    class WithCtor {
      initialized = 'ctor'
      value = 'default'
    }

    const plain = toPlain(new WithCtor()) as Record<string, unknown>
    delete plain.value

    const value = fromPlain(plain, WithCtor)
    expect(value.initialized).toBe('ctor')
    expect(value.value).toBe('default')
  })

  it('supports objectCreator custom factory', () => {
    const { seri, fromPlain, toPlain } = makeSeri()

    @seri({
      objectCreator: () => Object.assign(Object.create(WithCustomCreator.prototype) as WithCustomCreator, { created: 'custom' }),
    })
    class WithCustomCreator {
      created = 'ctor'
      value = 0
    }

    const tag = (toPlain(Object.create(WithCustomCreator.prototype)) as Record<string, unknown>)['!'] as number
    const value = fromPlain({ '!': tag, value: 7 }, WithCustomCreator)
    expect((value as unknown as Record<string, unknown>).created).toBe('custom')
    expect((value as unknown as Record<string, unknown>).value).toBe(7)
  })

  it('restores shared object references', () => {
    const { to, from } = makeSeri()

    const shared = { value: 1 }
    const input = { left: shared, right: shared }
    const value = from(to(input)) as { left: { value: number }, right: { value: number } }

    expect(value.left).toBe(value.right)
  })

  it('restores self references on registered classes', () => {
    const { seri, to, from } = makeSeri()

    @seri()
    class Node {
      next: Node | null = null
    }

    const node = new Node()
    node.next = node

    const value = from(to(node), Node)
    expect(value.next).toBe(value)
  })

  it('restores self references on arrays', () => {
    const { to, from } = makeSeri()

    const list: unknown[] = []
    list.push(list)

    const value = from(to(list)) as unknown[]
    expect(value[0]).toBe(value)
  })

  it('throws on unknown tags', () => {
    const { fromPlain } = makeSeri()

    expect(() => fromPlain({ '!': 999, value: 1 })).toThrow(SeriUnknownTagError)
  })

  it('throws on unknown references', () => {
    const { fromPlain } = makeSeri()

    expect(() => fromPlain({ child: { '!ref': 99 } })).toThrow(SeriUnknownReferenceError)
  })

  it('throws when typed from result mismatches', () => {
    const { seri, to, from } = makeSeri()

    @seri()
    class A {
      value = 1
    }

    @seri()
    class B {
      value = 2
    }

    expect(() => from(to(new A()), B)).toThrow(SeriTypeMismatchError)
  })

  it('restores built-in Set values', () => {
    const { fromPlain, toPlain } = makeSeri()

    const tag = (toPlain(new Set()) as Record<string, unknown>)['!'] as number

    const value = fromPlain({
      '!': tag,
      values: [1, 2, 3],
    }) as Set<number>

    expect(value).toBeInstanceOf(Set)
    expect(Array.from(value)).toEqual([1, 2, 3])
  })

  it('restores built-in Map values', () => {
    const { fromPlain, toPlain } = makeSeri()

    const tag = (toPlain(new Map()) as Record<string, unknown>)['!'] as number

    const value = fromPlain({
      '!': tag,
      entries: [[1, 'a'], ['b', { ok: true }]],
    }) as Map<unknown, unknown>

    expect(value).toBeInstanceOf(Map)
    expect(Array.from(value.entries())).toEqual([[1, 'a'], ['b', { ok: true }]])
  })

  it('restores Uint8Array values', () => {
    const { fromPlain, toPlain } = makeSeri()

    const tag = (toPlain(new Uint8Array()) as Record<string, unknown>)['!'] as number

    const value = fromPlain({
      '!': tag,
      data: [1, 2, 255],
    }) as Uint8Array

    expect(value).toBeInstanceOf(Uint8Array)
    expect(Array.from(value)).toEqual([1, 2, 255])
  })

  it('restores custom class plain handlers', () => {
    const { seri, toPlain, fromPlain } = makeSeri()

    @seri({
      toPlain: (instance) => {
        const point = instance as Point
        return { packed: [point.x, point.y] }
      },
      fromPlain: (plain) => {
        const point = Object.create(Point.prototype) as Point
        ;[point.x, point.y] = plain.packed as [number, number]
        return point
      },
    })
    class Point {
      x = 0
      y = 0
    }

    const point = Object.assign(Object.create(Point.prototype) as Point, { x: 3, y: 4 })
    const value = fromPlain(toPlain(point), Point)

    expect(value).toBeInstanceOf(Point)
    expect(value.x).toBe(3)
    expect(value.y).toBe(4)
  })
})
