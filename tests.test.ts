import { describe, expect, test } from 'bun:test'
import { Thread } from "./thread";

describe('Thread Class', () => {
    test('run() returns as expected', async () => {
        const numThread: Thread<number> = new Thread<number>((meaningOfLifeTheUniverseAndEverything: number) => { return meaningOfLifeTheUniverseAndEverything })
        expect(await numThread.run(42)).toBe(42)
    })
})