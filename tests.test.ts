import { beforeAll, describe, expect, test } from 'bun:test'
import { Thread } from "./thread";
import { setTimeout as setTimeoutPromise } from "timers/promises";

describe(Thread, () => {
    let addThread: Thread<number>
    let concatThread: Thread<string>
    beforeAll(() => {
        addThread = new Thread<number>((a: number, b: number) => {
            return a + b
        })
        concatThread = new Thread<string>((str: string, num: number) => {
            return str + ' : ' + num
        })
    })
    test('constructor()', () => {
        expect(addThread).toBeInstanceOf(Thread)
        expect(concatThread).toBeInstanceOf(Thread)
    })
    test('.closed property, .close() method, and automatic restart of worker', async () => {
        await addThread.run(1, 2)
        await concatThread.run('a', 'b')
        expect(addThread.closed).toBeFalse()
        expect(concatThread.closed).toBeFalse()
        await addThread.close()
        await concatThread.close()
        expect(addThread.closed).toBeTrue()
        expect(concatThread.closed).toBeTrue()
    })
    test('.busy property', async () => {
        const waitThread: Thread<void> = new Thread<void>(() => {setTimeout(() => {}, 100)})
        expect(waitThread.busy).toBeFalse()
        waitThread.run()
        expect(waitThread.busy).toBeTrue()
        await setTimeoutPromise(100)
        expect(waitThread.busy).toBeFalse()
    })
    test('.idle property', async () => {
        const waiter1: Thread<Promise<number>> = new Thread<Promise<number>>(async () => {
            await (await import('timers/promises')).setTimeout(50)
            return 1
        })
        const waiter2: Thread<Promise<number>> = new Thread<Promise<number>>(async () => {
            await (await import('timers/promises')).setTimeout(100)
            return 2
        })
        waiter1.run()
        waiter2.run()
        const winner = await Promise.race([waiter1.idle, waiter2.idle])
        expect(winner).toStrictEqual(waiter1)
        expect(winner).not.toStrictEqual(waiter2)
    })
    test('.run() returns as expected for synchronous functions', async () => {
        expect(await addThread.run(2, 3)).toBe(5)
        const question: string = 'What is the answer to the ultimate question of life, the universe, and everything?'
        expect(await concatThread.run(question, 42)).toBe(question + ' : ' + 42)
    })
    test('.run() returns as expected for asynchronous functions ', async () => {
        const numThreadAsync: Thread<Promise<number>> = new Thread<Promise<number>>(async () => {
            await (await import('timers/promises')).setTimeout(1)
            return 42
        })
        expect(await numThreadAsync.run()).toBe(42)
    })
})