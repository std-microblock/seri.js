import { describe, expect, it } from 'vitest'

import { makeSeri, SeriUnsupportedValueError } from '../src'

describe('encode', () => {
  it('encodes decorated instances to tagged plain objects', () => {
    const { seri, toPlain } = makeSeri()

    @seri()
    class User {
      id = 1
      name = 'alice'
    }

    expect(toPlain(new User())).toEqual({
      '!': expect.any(Number),
      id: 1,
      name: 'alice',
    })
  })

  it('omits fields marked with omit', () => {
    const { seri, toPlain } = makeSeri()

    @seri()
    class SecretBox {
      visible = 'ok'

      @seri.omit()
      hidden = 'secret'
    }

    expect(toPlain(new SecretBox())).toEqual({
      '!': expect.any(Number),
      visible: 'ok',
    })
  })

  it('supports omit-all with explicit include/default fields', () => {
    const { seri, toPlain } = makeSeri()

    @seri({ strategy: 'omit-all' })
    class PartialUser {
      @seri.include()
      id = 1

      name = 'hidden'

      @seri.default(123)
      score!: number
    }

    expect(toPlain(new PartialUser())).toEqual({
      '!': expect.any(Number),
      id: 1,
      score: undefined,
    })
  })

  it('uses codec transforms', () => {
    const { seri, toPlain } = makeSeri()

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

    expect(toPlain(new Session())).toEqual({
      '!': expect.any(Number),
      token: { token: 'abc' },
    })
  })

  it('encodes nested registered classes and arrays', () => {
    const { seri, toPlain } = makeSeri()

    @seri()
    class Child {
      value = 1
    }

    @seri()
    class Parent {
      child = new Child()
      list = [new Child()]
    }

    expect(toPlain(new Parent())).toEqual({
      '!': expect.any(Number),
      child: {
        '!': expect.any(Number),
        value: 1,
      },
      list: [
        {
          '!': expect.any(Number),
          value: 1,
        },
      ],
    })
  })

  it('encodes shared references using ref markers', () => {
    const { toPlain } = makeSeri()

    const shared = { value: 1 }
    const input = { left: shared, right: shared }

    expect(toPlain(input)).toEqual({
      left: { '!id': 1, value: 1 },
      right: { '!ref': 1 },
    })
  })

  it('encodes self references using ref markers', () => {
    const { seri, toPlain } = makeSeri()

    @seri()
    class Node {
      next: Node | null = null
    }

    const node = new Node()
    node.next = node

    expect(toPlain(node)).toEqual({
      '!': expect.any(Number),
      '!id': 1,
      next: { '!ref': 1 },
    })
  })

  it('encodes self-referencing arrays', () => {
    const { toPlain } = makeSeri()

    const list: unknown[] = []
    list.push(list)

    expect(toPlain(list)).toEqual({
      '!id': 1,
      '!values': [{ '!ref': 1 }],
    })
  })

  it('throws for unregistered class instances', () => {
    const { toPlain } = makeSeri()

    class Unregistered {
      value = 1
    }

    expect(() => toPlain({ item: new Unregistered() })).toThrow(SeriUnsupportedValueError)
  })

  it('throws for function values unless omitted', () => {
    const { seri, toPlain } = makeSeri()

    expect(() => toPlain({ run: () => 1 })).toThrow(SeriUnsupportedValueError)

    @seri()
    class Task {
      name = 'build'

      @seri.omit()
      run = () => 1
    }

    expect(toPlain(new Task())).toEqual({
      '!': expect.any(Number),
      name: 'build',
    })
  })

  it('encodes built-in Set values', () => {
    const { toPlain } = makeSeri()

    expect(toPlain(new Set([1, 2, 3]))).toEqual({
      '!': expect.any(Number),
      values: [1, 2, 3],
    })
  })

  it('encodes built-in Map values', () => {
    const { toPlain } = makeSeri()

    expect(toPlain(new Map<any, any>([[1, 'a'], ['b', { ok: true }]]))).toEqual({
      '!': expect.any(Number),
      entries: [[1, 'a'], ['b', { ok: true }]],
    })
  })

  it('encodes Uint8Array values', () => {
    const { toPlain } = makeSeri()

    expect(toPlain(new Uint8Array([1, 2, 255]))).toEqual({
      '!': expect.any(Number),
      data: [1, 2, 255],
    })
  })

  it('encodes custom seriTo payloads', () => {
    const { seri, toPlain } = makeSeri()

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
      x = 1
      y = 2
    }

    expect(toPlain(new Point())).toEqual({
      '!': expect.any(Number),
      packed: [1, 2],
    })
  })

  it('adds instance seriTo helper', () => {
    const { seri, to } = makeSeri()

    @seri()
    class User {
      id = 1
    }

    const instance = new User() as User & { seriTo(): ArrayBuffer }
    expect(instance.seriTo()).toEqual(to(instance))
  })
})
