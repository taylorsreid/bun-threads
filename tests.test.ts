import { describe, expect, test } from 'bun:test'
import { Thread } from "./thread";

describe('Thread Class', () => {
    test('run() returns as expected', async () => {
        const numThread: Thread<number> = new Thread<number>((meaningOfLifeTheUniverseAndEverything: number) => { return meaningOfLifeTheUniverseAndEverything })
        expect(await numThread.run(42)).toBe(42)
        await numThread.close()
        // const strThread: Thread<string> = new Thread<string>((str: string) => {
        //     return str + ', because my heart is in Ohio!'
        // })
        // expect
    })
    test('throws error on calling run() after close()', async () => {
        const anyThread: Thread<any> = new Thread<any>(() => {})
        await anyThread.run()
        await anyThread.close()
        expect(anyThread.run).toThrowError()
    });

    // TODO: test errors
    // const t = new Thread(() => {return 42})
    // console.log(await t.run())
    // t.close()
    // console.log(await t.run())
})