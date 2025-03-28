import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { Thread } from "./thread";

describe(Thread, () => {
    const question: string = 'What is the answer to the ultimate question of life, the universe, and everything?'
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
    afterAll(() => {
        addThread.close()
        concatThread.close()
    })
    test('constructor()', () => {
        expect(addThread).toBeInstanceOf(Thread)
        expect(concatThread).toBeInstanceOf(Thread)
    })
    test('runs on a separate thread', async () => {
        expect(await new Thread(async () => { return (await import('bun')).isMainThread }, { closeAfter: 0 }).run()).toBeFalse()
    })
    test('.fn can be changed', async () => {
        const changeableThread: Thread<string|number> = new Thread<string|number>(() => { return question })
        expect(await changeableThread.run()).toBe(question)
        changeableThread.fn = () => { return 42 }
        expect(await changeableThread.run()).toBe(42)
        changeableThread.close()
    })
    test('rejects to throw Error', () => {
        const errorThread: Thread = new Thread(() => { throw new Error('TEST ERROR') })
        expect(errorThread.run()).rejects.toThrowError()
        errorThread.close()
    })
    test('.closed property and manual .close() method', async () => {
        await addThread.run(1, 2)
        await concatThread.run('a', 'b')
        expect(addThread.closed).toBeFalse()
        expect(concatThread.closed).toBeFalse()
        await addThread.close()
        await concatThread.close()
        expect(addThread.closed).toBeTrue()
        expect(concatThread.closed).toBeTrue()
    })
    test('.closed property and .closeAfter property', async () => {
        const selfClosingThread: Thread<number> = new Thread(() => 42, { closeAfter: 10 })
        expect(selfClosingThread.closed).toBeTrue()
        await selfClosingThread.run()
        expect(selfClosingThread.closed).toBeFalse()
        await Bun.sleep(10)
        expect(selfClosingThread.closed).toBeTrue()
        selfClosingThread.close()
    })
    test('.busy property', async () => {
        const waitThread: Thread<void> = new Thread<void>(() => {setTimeout(() => {}, 100)})
        expect(waitThread.busy).toBeFalse()
        waitThread.run() // intentionally don't await
        expect(waitThread.busy).toBeTrue()
        await Bun.sleep(100)
        expect(waitThread.busy).toBeFalse()
        waitThread.close()
    })
    test('.idle property', async () => {
        const waiter1: Thread<Promise<number>> = new Thread<Promise<number>>(async () => {
            await Bun.sleep(50)
            return 1
        })
        const waiter2: Thread<Promise<number>> = new Thread<Promise<number>>(async () => {
            await Bun.sleep(100)
            return 2
        })
        waiter1.run()
        waiter2.run()
        const winner = await Promise.race([waiter1.idle, waiter2.idle])
        expect(winner).toStrictEqual(waiter1)
        expect(winner).not.toStrictEqual(waiter2)
        waiter1.close()
        waiter2.close()
    })
    test('.run() returns as expected for synchronous functions', async () => {
        expect(await addThread.run(2, 3)).toBe(5)
        expect(await concatThread.run(question, 42)).toBe(question + ' : ' + 42)
    })
    test('.run() returns as expected for asynchronous functions ', async () => {
        const numThreadAsync: Thread<Promise<number>> = new Thread<Promise<number>>(async () => {
            await (await import('timers/promises')).setTimeout(1)
            return 42
        })
        expect(await numThreadAsync.run()).toBe(42)
        numThreadAsync.close()
    })
})