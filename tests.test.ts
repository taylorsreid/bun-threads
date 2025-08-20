// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { availableParallelism } from 'os';
import { SharedValue, SharedValueServer } from './sharedvalue';
import { Thread } from "./thread";
import { ThreadPool } from './threadpool';

const helloWorld = () => {
    return 'hello world'
}
const add = (a: number, b: number) => {
    return a + b
}
const subtract = (a: number, b: number) => {
    return a - b
}
const sum = (to: number) => {
    let sum = 0
    for (let i = 0; i < to; i++) {
        sum += i
    }
    return sum
}

describe(Thread, () => {
    describe('.id', () => {
        test('initializes undefined', () => {
            expect(new Thread(helloWorld).id).toBeUndefined()
        })
        test('mutates to integer', async () => {
            const thread = new Thread(helloWorld)
            await thread.run()
            expect(thread.id).toBeInteger()
            thread.close()
        })
    })
    describe('.fn', () => {
        test('initializes', () => {
            expect(new Thread(helloWorld).fn).toBeFunction()
        })
    })
    describe('.idleTimeout', () => {
        test('initializes', () => {
            expect(new Thread(helloWorld).idleTimeout).toBe(0)
            expect(new Thread(helloWorld, { idleTimeout: 60_000 }).idleTimeout).toBe(60_000)
            expect(new Thread(helloWorld, { idleTimeout: Infinity }).idleTimeout).toBe(Infinity)
        })
        test('is mutable', () => {
            const thread = new Thread(helloWorld)
            thread.idleTimeout = 60_000
            expect(thread.idleTimeout).toBe(60_000)
        })
        test('closes automatically', async () => {
            const thread = new Thread(helloWorld, { idleTimeout: 10 })
            await thread.run()
            expect(thread.closed).toBeFalse()
            await Bun.sleep(15)
            expect(thread.closed).toBeTrue()
        })
        test('throws on invalid value', () => {
            expect(() => { new Thread(helloWorld).idleTimeout = -1 }).toThrowError(RangeError)
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
            await Bun.sleep(20)
            expect(thread.busy).toBeFalse()
            thread.close()
        })
    })
    describe('.idle', () => {
        test('resolves immediately when idle', () => {
            expect(Bun.peek.status(new Thread(helloWorld).idle)).toBe('fulfilled')
        })
        test('resolves in order', async () => {
            const thread1 = new Thread(async () => {
                await Bun.sleep(10)
                return 1
            })
            const thread2 = new Thread(async () => {
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
            expect(new Thread(() => Bun.isMainThread).run()).resolves.toBeFalse()
        })
        test('returns as expected for synchronous expressions', () => {
            expect(new Thread(() => Bun.isMainThread).run()).resolves.toBeFalse()
            expect(new Thread(() => typeof Bun !== "undefined").run()).resolves.toBeTrue()
            expect(new Thread(() => import("os").then((os) => os.EOL)).run()).resolves.toBeOneOf(['\n', '\r\n'])
        })
        test('returns as expected for synchronous functions', () => {
            expect(new Thread(add).run(2, 3)).resolves.toBe(5)
            expect(new Thread(subtract).run(2, 3)).resolves.toBe(-1)
            expect(new Thread(helloWorld).run()).resolves.toBe('hello world')
        })
        test('returns as expected for asynchronous expressions', () => {
            expect(new Thread(async () => Promise.resolve(Bun.isMainThread)).run()).resolves.toBeFalse()
            expect(new Thread(async () => Promise.resolve(typeof Bun !== "undefined")).run()).resolves.toBeTrue()
            expect(new Thread(async () => Promise.resolve(import("os").then((os) => os.EOL))).run()).resolves.toBeOneOf(['\n', '\r\n'])
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
        test('resolves only for the correct call', () => {
            // commenting out the if (event.id === id) in run()'s internal check() function causes this test to fail
            const thread = new Thread(sum)
            const p1 = thread.run(1_000_000) // 499999500000
            const p2 = thread.run(1_000) // 499500 
            const p3 = thread.run(100) // 4950
            const p4 = thread.run(10)  // 45
            expect(p1).resolves.toBe(499999500000)
            expect(p2).resolves.toBe(499500)
            expect(p3).resolves.toBe(4950)
            expect(p4).resolves.toBe(45)
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

describe(ThreadPool, () => {
    describe('.threads', () => {
        describe('initializes', () => {
            const tp = new ThreadPool(helloWorld)
            expect(tp['threads']).toBeArrayOfSize(tp.maxThreads)
            expect(tp['threads'][0]?.idleTimeout).toBe(Infinity)
            expect(tp['threads'][tp['threads'].length - 1]?.idleTimeout).toBeOneOf([Infinity, 0])
            tp.close()
        })
    })
    describe('.fn', () => {
        test('initializes', () => {
            const tp = new ThreadPool(helloWorld, {
                maxThreads: 2
            })
            expect(tp.fn).toBe(helloWorld)
            expect(tp['threads'][0]?.fn).toBe(helloWorld)
            expect(tp['threads'][1]?.fn).toBe(helloWorld)
            tp.close()
        })
    })
    describe('.minthreads', () => {
        describe('initializes', () => {
            test('default', () => {
                const tp = new ThreadPool(helloWorld)
                expect(tp.minThreads).toBe(1)
                tp.close()
            })
            test('custom', () => {
                const tp = new ThreadPool(helloWorld, {
                    minThreads: 2
                })
                expect(tp.minThreads).toBe(2)
                tp.close()
            })
        })
        test('throws on invalid values', () => {
            expect(() => { new ThreadPool(helloWorld, { minThreads: -1 }).close() }).toThrowError()
            expect(() => { new ThreadPool(helloWorld, { minThreads: 4.2 }).close() }).toThrowError()
        })
        test('is mutable', () => {
            const tp = new ThreadPool(helloWorld)
            tp.minThreads = 2
            expect(tp.minThreads).toBe(2)
            tp.close()
        })
        describe('side effects', () => {
            test('mutates .maxThreads ', () => {
                const tp = new ThreadPool(helloWorld, {
                    minThreads: 1,
                    maxThreads: 1
                })
                tp.minThreads = 2
                expect(tp.maxThreads).toBe(2)
                tp.close()
            })
            test('mutates .threads', () => {
                const tp = new ThreadPool(helloWorld, {
                    minThreads: 0,
                    maxThreads: 1,
                    idleTimeout: 30_000
                })
                expect(tp['threads']).toBeArrayOfSize(1)
                expect(tp['threads'][0]?.idleTimeout).toBe(30_000)
                tp.minThreads = 2
                expect(tp['threads']).toBeArrayOfSize(2)
                expect(tp['threads'][0]?.idleTimeout).toBe(Infinity)
                expect(tp['threads'][1]?.idleTimeout).toBe(Infinity)
                tp.close()
            })
        })
    })
    describe('.maxThreads', () => {
        describe('initializes', () => {
            test('default', () => {
                const tp = new ThreadPool(helloWorld)
                expect(tp.maxThreads).toBe(availableParallelism() - 1)
                tp.close()
            })
            test('custom', () => {
                const tp = new ThreadPool(helloWorld, {
                    maxThreads: 2
                })
                expect(tp.maxThreads).toBe(2)
                tp.close()
            })
        })
        test('throws on invalid values', () => {
            expect(() => { new ThreadPool(helloWorld, { maxThreads: -1 }).close() }).toThrowError()
            expect(() => { new ThreadPool(helloWorld, { maxThreads: 4.2 }).close() }).toThrowError()
        })
        test('is mutable', () => {
            const tp = new ThreadPool(helloWorld)
            tp.maxThreads = 2
            expect(tp.maxThreads).toBe(2)
            tp.close()
        })
        describe('side effects', () => {
            test('mutates .minThreads ', () => {
                const tp = new ThreadPool(helloWorld, {
                    minThreads: 2,
                    maxThreads: 2
                })
                tp.maxThreads = 1
                expect(tp.minThreads).toBe(1)
                tp.close()
            })
            describe('mutates .threads', () => {
                test('shrinks', () => {
                    const tp = new ThreadPool(helloWorld, {
                        minThreads: 0,
                        maxThreads: 2
                    })
                    expect(tp['threads']).toBeArrayOfSize(2)
                    tp.maxThreads = 1
                    expect(tp['threads']).toBeArrayOfSize(1)
                    tp.close()
                })
                test('grows', () => {
                    const tp = new ThreadPool(helloWorld, {
                        minThreads: 0,
                        maxThreads: 1,
                        idleTimeout: 30_000
                    })
                    expect(tp['threads']).toBeArrayOfSize(1)
                    expect(tp['threads'][0]?.idleTimeout).toBe(30_000)
                    tp.maxThreads = 2
                    expect(tp['threads']).toBeArrayOfSize(2)
                    expect(tp['threads'][0]?.idleTimeout).toBe(30_000)
                    expect(tp['threads'][1]?.idleTimeout).toBe(30_000)
                    tp.close()
                })
            })
        })
    })
    describe('.idleTimeout', () => {
        describe('initializes', () => {
            test('default', () => {
                const tp = new ThreadPool(helloWorld)
                expect(tp.idleTimeout).toBe(0)
                tp.close()
            })
            test('custom', () => {
                const tp = new ThreadPool(helloWorld, { idleTimeout: 12345 })
                expect(tp.idleTimeout).toBe(12345)
                tp.close()
            })
        })
        describe('side effects', () => {
            test('mutates .threads', () => {
                const tp = new ThreadPool(helloWorld, {
                    minThreads: 1,
                    maxThreads: 2
                })
                expect(tp['threads'][1]?.idleTimeout).toBe(0)
                tp.idleTimeout = 12345
                expect(tp['threads'][0]?.idleTimeout).toBe(Infinity)
                expect(tp['threads'][1]?.idleTimeout).toBe(12345)
                tp.close()
            })
        })
    })
    describe('.busy', () => {
        test('initializes', () => {
            expect(new ThreadPool(helloWorld).busy).toBe(0)
        })
        test('increases', () => {
            const tp = new ThreadPool(helloWorld)
            tp.run()
            expect(tp.busy).toBe(1)
            tp.run()
            expect(tp.busy).toBe(2)
            tp.close()
        })
        test('decreases', async () => {
            const tp = new ThreadPool(helloWorld)
            for (let i = 0; i < tp.maxThreads; i++) {
                tp.run()
            }
            expect(tp.busy).toBe(tp.maxThreads)
            await tp.idle
            expect(tp.busy).toBe(0)
        })
    })
    describe('.idle', () => {
        test('resolves when idle', () => {
            expect(new ThreadPool(helloWorld).idle).resolves.toBe(undefined)
        })
        test('mutates', async () => {
            const tp = new ThreadPool(helloWorld)
            const promise = tp.run()
            expect(Bun.peek.status(promise)).toBe('pending')
            await promise
            expect(Bun.peek.status(promise)).toBe('fulfilled')
        })
    })
    describe('.run()', () => {
        test('is on a separate thread', () => {
            expect(new ThreadPool(() => Bun.isMainThread, { idleTimeout: 0 }).run()).resolves.toBeFalse()
        })
        test('returns as expected for synchronous expressions', () => {
            expect(new ThreadPool(() => Bun.isMainThread, { idleTimeout: 0 }).run()).resolves.toBeFalse()
            expect(new ThreadPool(() => typeof Bun !== "undefined", { idleTimeout: 0 }).run()).resolves.toBeTrue()
            expect(new ThreadPool(() => import("os").then((os) => os.EOL), { idleTimeout: 0 }).run()).resolves.toBeOneOf(['\n', '\r\n'])
        })
        test('returns as expected for synchronous functions', () => {
            expect(new ThreadPool(add, { idleTimeout: 0 }).run(2, 3)).resolves.toBe(5)
            expect(new ThreadPool(subtract, { idleTimeout: 0 }).run(2, 3)).resolves.toBe(-1)
            expect(new ThreadPool(helloWorld, { idleTimeout: 0 }).run()).resolves.toBe('hello world')
        })
        test('returns as expected for asynchronous expressions', () => {
            expect(new ThreadPool(async () => Promise.resolve(Bun.isMainThread), { idleTimeout: 0 }).run()).resolves.toBeFalse()
            expect(new ThreadPool(async () => Promise.resolve(typeof Bun !== "undefined"), { idleTimeout: 0 }).run()).resolves.toBeTrue()
            expect(new ThreadPool(async () => Promise.resolve(import("os").then((os) => os.EOL)), { idleTimeout: 0 }).run()).resolves.toBeOneOf(['\n', '\r\n'])
        })
        test('returns as expected for asynchronous functions', () => {
            const tp = new ThreadPool(async () => {
                await Bun.sleep(1)
                return 42
            })
            expect(tp.run()).resolves.toBe(42)
            tp.close()
        })
        test('rejects with Error', () => {
            const tp = new ThreadPool(() => { throw new Error('TEST ERROR') })
            expect(tp.run()).rejects.toThrowError('TEST ERROR')
            tp.close()
        })
        test('can run multiple threads concurrently', async () => {
            const tp = new ThreadPool(async () => { await Bun.sleep(100) })
            const p1 = tp.run()
            const p2 = tp.run()
            expect(Bun.peek.status(p1)).toBe('pending')
            expect(Bun.peek.status(p2)).toBe('pending')
            expect(tp['threads'][0]?.id).not.toBe(tp['threads'][1]?.id)
            await Bun.sleep(200)
            expect(Bun.peek.status(p1)).toBe('fulfilled')
            expect(Bun.peek.status(p2)).toBe('fulfilled')
            tp.close()
        })
    })
})

describe(SharedValue, () => {
    let server: SharedValueServer
    beforeEach(() => server = new SharedValueServer())
    test('runs in a Thread', async () => {
        const SharedValue = (await import('./sharedvalue')).SharedValue
        const thread = new Thread(async () => {
            (await SharedValue.new('foo', 'bar')).release()
            return (await SharedValue.get('foo', false)).value
        })
        expect(await thread.run()).toBe('bar')
    });
    test('does not need to be imported into a Thread', async () => {
        const thread = new Thread(async () => {
            (await SharedValue.new('foo', 'bar')).release()
            return (await SharedValue.get('foo', false)).value
        })
        expect(await thread.run()).toBe('bar')
    });
    test('runs in a ThreadPool', async () => {
        const SharedValue = (await import('./sharedvalue')).SharedValue
        const tp = new ThreadPool(async () => {
            (await SharedValue.new('foo', 'bar')).release()
            return (await SharedValue.get('foo', false)).value
        })
        expect(await tp.run()).toBe('bar')
    });
    test('does not need to be imported into a ThreadPool', async () => {
        const tp = new ThreadPool(async () => {
            (await SharedValue.new('foo', 'bar')).release()
            return (await SharedValue.get('foo', false)).value
        })
        expect(await tp.run()).toBe('bar')
    });
    test('.new()', async () => {
        const sv = await SharedValue.new('foo', 'bar')
        expect(sv.key).toBe('foo')
        expect(sv.value).toBe('bar')
        expect(sv.waiting).toBe(0)
        expect(sv.locked).toBeTrue()
        expect(server['kv']['foo'].value).toBe('bar')
        expect(server['kv']['foo'].queue).toBeArrayOfSize(1)
        sv.release()
    });
    test('.exists()', async () => {
        expect(await SharedValue.exists('foo')).toBeFalse()
        ;(await SharedValue.new('foo', 'bar')).release()
        expect(await SharedValue.exists('foo')).toBeTrue()
    });
    test('.get()', async () => {
        expect(async () => { await SharedValue.get('foo') }).toThrowError()
        ;(await SharedValue.new('foo', 'bar')).release()
        const sv: SharedValue<string> = await SharedValue.get('foo')
        expect(sv.key).toBe('foo')
        expect(sv.value).toBe('bar')
        expect(sv.waiting).toBe(0)
        expect(sv.locked).toBeTrue()
        sv.release()
    });
    test('.save()', async () => {
        (await SharedValue.new('foo', 'bar')).release()
        let sv: SharedValue<string> = await SharedValue.get('foo')
        expect(sv.value).toBe('bar')
        sv.value = 'buzz'
        sv.save().release()
        sv = await SharedValue.get('foo')
        expect(sv.value).toBe('buzz')
        sv.release()
    });
    test('.release()', async () => {
        const sv = await SharedValue.new('foo', 'bar')
        expect(sv.locked).toBeTrue()
        expect(sv.release()).toBeTrue()
        expect(sv.locked).toBeFalse()
        expect(sv.release()).toBeFalse()
    });
    afterEach(() => server.shutdown())
});

describe(SharedValueServer, () => {
    test('runs on main thread', async () => {
        expect(() => { new SharedValueServer().shutdown() }).not.toThrow()
    });
    test('does not need to be imported into a Thread', async () => {
        const thread = new Thread(async () => {
            new SharedValueServer()
        })
        expect(() => { thread.run() }).not.toThrow()
    });
    test('runs on separate threads', async () => {
        const server = new Thread(async () => {
            new SharedValueServer()
        }, {
            idleTimeout: Infinity
        })

        const client = new Thread(async () => {
            (await SharedValue.new('foo', 'bar')).release()
            const sv: SharedValue<string> = await SharedValue.get('foo')
            sv.release()
            return sv.value
        })

        await server.run()
        expect(await client.run()).toBe('bar')
        server.close()
    });
    // test('.kv mutates', async () => {
    //     const server = new SharedValueServer()
    //     expect(server['kv']).toStrictEqual({});
    //     (await SharedValue.new('foo', 'bar')).release()
    //     await Bun.sleep(10) // release takes a short time to actually take effect but isn't a promise
    //     // @ts-ignore
    //     expect(server['kv']['foo'].value).toBe('bar')
    //     expect(server['kv']['foo'].queue).toBeArrayOfSize(0)
    //     server.shutdown()
    // });
});