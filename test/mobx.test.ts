import { describe, expect, it } from 'vitest'
import { isObservable, isObservableArray, isObservableObject, makeAutoObservable, toJS, observable } from 'mobx'

import { makeSeri, SeriUnsupportedValueError } from '../src'

describe('mobx compatibility', () => {
  it('supports observable plain objects without extra codecs', () => {
    const { toPlain, fromPlain } = makeSeri()

    const state = observable({
      count: 1,
      nested: {
        label: 'ok',
      },
    })

    expect(isObservable(state)).toBe(true)
    expect(isObservableObject(state)).toBe(true)

    const plain = toPlain(state)
    expect(plain).toEqual({
      count: 1,
      nested: {
        label: 'ok',
      },
    })

    const restored = fromPlain(plain) as { count: number; nested: { label: string } }
    expect(restored).toEqual({
      count: 1,
      nested: {
        label: 'ok',
      },
    })
  })

  it('supports observable arrays without extra codecs', () => {
    const { toPlain, fromPlain } = makeSeri()

    const list = observable([1, { value: 2 }])

    expect(isObservable(list)).toBe(true)
    expect(isObservableArray(list)).toBe(true)

    const plain = toPlain(list)
    expect(plain).toEqual([1, { value: 2 }])

    const restored = fromPlain(plain) as [number, { value: number }]
    expect(restored).toEqual([1, { value: 2 }])
  })

  it('supports toJS codec for observable fields when desired', () => {
    const { seri, toPlain, fromPlain } = makeSeri()

    @seri()
    class StoreHolder {
      @seri.codec(
        (value: { count: number; nested: { ok: boolean } }) => toJS(value),
        (plain: { count: number; nested: { ok: boolean } }) => observable(plain),
      )
      state = observable({
        count: 1,
        nested: { ok: true },
      })
    }

    const plain = toPlain(new StoreHolder())
    expect(plain).toEqual({
      '!': expect.any(Number),
      state: {
        count: 1,
        nested: { ok: true },
      },
    })

    const restored = fromPlain(plain, StoreHolder)
    expect(isObservable(restored.state)).toBe(true)
    expect(restored.state.count).toBe(1)
    expect(restored.state.nested.ok).toBe(true)
  })

  it('requires reinitialization for makeAutoObservable class instances', () => {
    const { seri, toPlain, fromPlain } = makeSeri()

    @seri({
      afterDeserialize: (instance) => {
        makeAutoObservable(instance)
      },
    })
    class CounterStore {
      count = 1

      constructor() {
        makeAutoObservable(this)
      }

      inc(): void {
        this.count += 1
      }
    }

    const store = new CounterStore()
    expect(isObservable(store)).toBe(true)

    const plain = toPlain(store)
    expect(plain).toEqual({
      '!': expect.any(Number),
      count: 1,
    })

    const restored = fromPlain(plain, CounterStore)
    expect(restored).toBeInstanceOf(CounterStore)
    expect(isObservable(restored)).toBe(true)
    restored.inc()
    expect(restored.count).toBe(2)
  })

  it('fails fast for unregistered MobX class instances', () => {
    const { toPlain } = makeSeri()

    class CounterStore {
      count = 1

      constructor() {
        makeAutoObservable(this)
      }
    }

    expect(() => toPlain({ store: new CounterStore() })).toThrow(SeriUnsupportedValueError)
  })
})
