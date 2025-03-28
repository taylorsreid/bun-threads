import { describe, expect, test } from 'bun:test';
import { Thread } from "./thread";

const helloWorld = () => {
    return 'hello world'
}
const add = (a: number, b: number) => {
    return a + b
}
const subtract = (a: number, b: number) => {
    return a - b
}

describe(Thread, () => {
    describe('.fn', () => {
        test('initializes', () => {
            expect(new Thread(helloWorld).fn).toBeFunction()
        })
        test('is mutable', () => {
            const thread = new Thread(add)
            expect(thread.run(5, 2)).resolves.toBe(7)
            thread.fn = subtract
            expect(thread.run(5, 2)).resolves.toBe(3)
            thread.close()
        })
    })
    describe('.closeAfter', () => {
        test('initializes', () => {
            expect(new Thread(helloWorld).closeAfter).toBe(Infinity)
            expect(new Thread(helloWorld, { closeAfter: 60_000 }).closeAfter).toBe(60_000)
        })
        test('is mutable', () => {
            const thread = new Thread(helloWorld)
            thread.closeAfter = 60_000
            expect(thread.closeAfter).toBe(60_000)
        })
        test('closes automatically', async () => {
            const thread = new Thread(helloWorld, { closeAfter: 10 })
            await thread.run()
            expect(thread.closed).toBeFalse()
            await Bun.sleep(10)
            expect(thread.closed).toBeTrue()
        })
        test('throws on invalid value', () => {
            expect(() => { new Thread(helloWorld).closeAfter = -1 }).toThrowError(RangeError)
        })
    })
    describe('.closed', () => {
        test('initializes', () => {
            expect(new Thread(helloWorld).closed).toBeTrue()
        })
        test('side effects', async () => {
            const thread = new Thread(helloWorld)
            await thread.run()
            expect(thread.closed).toBeFalse()
            await thread.close()
            expect(thread.closed).toBeTrue()
        })
    })
    describe('.busy', () => {
        test('initializes', () => {
            expect(new Thread(helloWorld).busy).toBeFalse()
        })
        test('side effects', async () => {
            const thread = new Thread(() => {setTimeout(() => {}, 10)})
            thread.run() // intentionally don't await
            expect(thread.busy).toBeTrue()
            await Bun.sleep(10)
            expect(thread.busy).toBeFalse()
            thread.close()
        })
    })
    describe('.idle', () => {
        test('resolves immediately when idle', () => {
            expect(Bun.peek.status(new Thread(helloWorld).idle)).toBe('fulfilled')
        })
        test('resolves in order', async () => {
            const thread1: Thread = new Thread(async () => {
                await Bun.sleep(10)
                return 1
            })
            const thread2: Thread = new Thread(async () => {
                await Bun.sleep(20)
                return 2
            })
            thread1.run()
            thread2.run()
            const winner = await Promise.race([thread1.idle, thread2.idle])
            expect(winner).toStrictEqual(thread1)
            expect(winner).not.toStrictEqual(thread2)
            thread1.close()
            thread2.close()
        })
    })
    describe('.run()', () => {
        test('is on a separate thread', () => {
            expect(new Thread(async () => { return (await import('bun')).isMainThread }, { closeAfter: 0 }).run()).resolves.toBeFalse()
        })
        test('returns as expected for synchronous functions', () => {
            expect(new Thread(add, { closeAfter: 0 }).run(2, 3)).resolves.toBe(5)
            expect(new Thread(subtract, { closeAfter: 0 }).run(2, 3)).resolves.toBe(-1)
            expect(new Thread(helloWorld, { closeAfter: 0 }).run()).resolves.toBe('hello world')
        })
        test('returns as expected for asynchronous functions', () => {
            const thread = new Thread(async () => {
                await Bun.sleep(1)
                return 42
            })
            expect(thread.run()).resolves.toBe(42)
            thread.close()
        })
        test('rejects with Error', () => {
            const thread = new Thread(() => { throw new Error('TEST ERROR') })
            expect(thread.run()).rejects.toThrowError('TEST ERROR')
            thread.close()
        })
    })
    describe('.close()', () => {
        test('returns as expected', () => {
            const thread = new Thread(helloWorld)
            expect(thread.close()).resolves.toBeFalse()
            thread.run()
            expect(thread.close()).resolves.toBeTrue()
            expect(thread.close()).resolves.toBeFalse()
        })
    })
    test('events', () => {
        const thread = new Thread(helloWorld)
        expect(thread.on('busy', () => {})).toStrictEqual(thread)
        expect(thread.prependListener('busy', () => {})).toStrictEqual(thread)
    })
})