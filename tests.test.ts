import { beforeAll, describe, expect, test } from 'bun:test'
import { Thread } from "./thread";
import { setTimeout as setTimeoutPromise } from "timers/promises";

describe('Thread Class', () => {
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
    test('run() returns as expected for synchronous functions', async () => {
        expect(await addThread.run(2, 3)).toBe(5)
        const question: string = 'What is the answer to the ultimate question of life, the universe, and everything?'
        expect(await concatThread.run(question, 42)).toBe(question + ' : ' + 42)
    })
    test('run() returns as expected for asynchronous functions ', async () => {
        const numThreadAsync: Thread<Promise<number>> = new Thread<Promise<number>>(async () => {
            await (await import('timers/promises')).setTimeout(1)
            return 42
        })
        expect(await numThreadAsync.run()).toBe(42)
    })
    test('.start() / .stop() methods and .stopped property', async () => {
        expect(addThread.start()).toBeInteger()
        expect(concatThread.start()).toBeInteger()
        expect(addThread.stopped).toBeFalse()
        expect(concatThread.stopped).toBeFalse()
        await addThread.stop()
        await concatThread.stop()
        expect(addThread.stopped).toBeTrue()
        expect(concatThread.stopped).toBeTrue()
    })
    test('.busy property is correct', async () => {
        const waitThread: Thread<void> = new Thread<void>(() => {setTimeout(() => {}, 100)})
        expect(waitThread.busy).toBeFalse()
        waitThread.run()
        expect(waitThread.busy).toBeTrue()
        await setTimeoutPromise(100)
        expect(waitThread.busy).toBeFalse()
    })
    test('thread automatically restarts after calling .stop()', async () => {
        await addThread.stop()
        await concatThread.stop()
        expect(await addThread.run(1, 2)).toBe(3)
        expect(await concatThread.run('a', 'b')).toBe('a : b')
        expect(addThread.stopped).toBeFalse()
        expect(concatThread.stopped).toBeFalse()
    })
})