import { describe, expect, it } from 'vitest'

import { makeSeri, SeriTypeMismatchError, SeriUnknownReferenceError, SeriUnknownTagError } from '../src'

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
})
