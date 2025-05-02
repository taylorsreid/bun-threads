// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { availableParallelism } from "os";
import { Thread, type ThreadOptions } from "./thread";

export interface ThreadPoolOptions extends ThreadOptions {
    /** {@inheritDoc ThreadPool.minThreads} */
    minThreads?: number,
    /** {@inheritDoc ThreadPool.maxThreads} */
    maxThreads?: number
}

/**
 * A pool of available threads that can be called to run a task multiple times in parallel.
 * 
 * The following example demonstrates the benefits of using the ThreadPool class over a single {@link Thread} class:
 * @typeParam T - The signature of your callback function, including its arguments and return type.
 * @example
 * ```ts
 * import { Thread } from "./thread";
 * import { ThreadPool } from "./threadpool";
 * 
 * const thread = new Thread((wait: number) => {
 *     Bun.sleepSync(wait) // simulate some synchronous work
 * })
 * const threadPool = new ThreadPool((wait: number) => {
 *     Bun.sleepSync(wait) // simulate some synchronous work
 * })
 * 
 * let start = performance.now()
 * await Promise.all([,
 *     thread.run([1_000]),
 *     thread.run([1_000]),
 *     thread.run([1_000])
 * ])
 * // a single Thread can only execute synchronous tasks one at a time
 * console.log('Thread completed in:', performance.now() - start, 'ms') // ~ 3000 ms
 * 
 * start = performance.now()
 * await Promise.all([,
 *     threadPool.run([1_000]),
 *     threadPool.run([1_000]),
 *     threadPool.run([1_000])
 * ])
 * // ThreadPool runs each task in a separate Thread in parallel
 * console.log('ThreadPool completed in:', performance.now() - start, 'ms') // ~ 1000 ms
 * 
 * thread.close()
 * threadPool.close()
 * ```
 */
export class ThreadPool<T extends (...args: any[]) => any> {
    private threads: Thread<T>[]

    /** {@inheritDoc Thread.fn} */
    public readonly fn: T

    private _minThreads!: number
    /**
     * The number of {@link Thread Threads} to keep active with a {@link Thread.idleTimeout} of `Infinity` (never close automatically).
     * By default, one `Thread` will be kept warm for fast startup times.
     * Additional `Thread`s in the range of `minThreads` + 1 and {@link maxThreads} (inclusive) will have their `Thread.idleTimeout` set to {@link idleTimeout}.
     * Setting this value to greater than `maxThreads` will cause `maxThreads` to be raised to the same value.
     * @default 1
     * @throws `RangeError` if value < 0 or if value is not an integer
     */
    public get minThreads(): number {
        return this._minThreads
    }
    /**
     * The number of {@link Thread Threads} to keep active with a {@link Thread.idleTimeout} of `Infinity` (never close automatically).
     * By default, one `Thread` will be kept warm for fast startup times.
     * Additional `Thread`s in the range of `minThreads` + 1 and {@link maxThreads} (inclusive) will have their `Thread.idleTimeout` set to {@link idleTimeout}.
     * Setting this value to greater than `maxThreads` will cause `maxThreads` to be raised to the same value.
     * @default 1
     * @throws `RangeError` if value < 0 or if value is not an integer
     */
    public set minThreads(value: number) {
        if (value < 0 || !Number.isInteger(value)) {
            throw new RangeError(`minThreads must be set to a positive integer greater than or equal to 0. Received ${value}`)
        }
        else if (value > this.maxThreads) {
            this.maxThreads = value
        }
        for (let i = 0; i < value; i++) {
            if (typeof this.threads[i] === 'undefined') {
                this.threads[i] = new Thread<T>(this.fn, { idleTimeout: Infinity })
            }
            else if (this.threads[i]!.idleTimeout !== Infinity) {
                this.threads[i]!.idleTimeout = Infinity
            }
        }
        for (let i = value; i < this.threads.length; i++) {
            if (typeof this.threads[i] === 'undefined') {
                this.threads[i] = new Thread<T>(this.fn, { idleTimeout: this.idleTimeout })
            }
            else if (this.threads[i]!.idleTimeout !== this.idleTimeout) {
                this.threads[i]!.idleTimeout = this.idleTimeout
            }
        }
        this._minThreads = value
    }

    private _maxThreads!: number
    /**
     * The maximum number of {@link Thread Threads} that are allowed to be running at once. Once this limit is reached, any further calls will be enqueued in a promise until a `Thread` becomes available.
     * By default, the maximum is set to {@link https://nodejs.org/api/os.html#osavailableparallelism os.availableParallelism()} - 1, which generally should not be exceeded, as it should not offer any performance gains.
     * Setting this value to less than {@link minThreads} will cause `minThreads` to be lowered to the same value.
     * @default os.availableParallelism() - 1
     * @throws `RangeError` if value < 1 or if value is not an integer
     */
    public get maxThreads(): number {
        return this._maxThreads
    }
    /**
     * The maximum number of {@link Thread Threads} that are allowed to be running at once. Once this limit is reached, any further calls will be enqueued in a promise until a `Thread` becomes available.
     * By default, the maximum is set to {@link https://nodejs.org/api/os.html#osavailableparallelism os.availableParallelism()} - 1, which generally should not be exceeded, as it should not offer any performance gains.
     * Setting this value to less than {@link minThreads} will cause `minThreads` to be lowered to the same value.
     * @default os.availableParallelism() - 1
     * @throws `RangeError` if value < 1 or if value is not an integer
     */
    public set maxThreads(value: number) {
        if (value < 1 || !Number.isInteger(value)) {
            throw new RangeError(`maxThreads must be set to a positive integer greater than or equal to 1. Received ${value}`)
        }
        else if (value < this.minThreads) {
            this.minThreads = value
        }
        if (value < this.maxThreads) {
            while (this.threads.length > value) {
                this.threads.pop()?.close()
            }
        }
        else if (value > this.maxThreads) {
            while (this.threads.length < value) {
                this.threads.push(new Thread<T>(this.fn, { idleTimeout: this.idleTimeout }))
            }
        }
        this._maxThreads = value
    }

    private _idleTimeout!: number;
    /**
     * How long (in milliseconds) to keep the dynamic {@link Thread Threads} in the `ThreadPool` active after completing a task before terminating them.
     * {@link minThreads} number of `Thread`s have their {@link Thread.idleTimeout} set to `Infinity`. All other threads will have their `Thread.idleTimeout` set to this value.
     * This allows the `ThreadPool` to grow and shrink based upon demand, using more or less resources as required.
     * Default is `0` (close immediately).
     * Changing this value will restart the `ThreadPool`'s internal timer.
     * @default 0
     * @throws `RangeError` if value < 0
     */
    public get idleTimeout(): number {
        return this._idleTimeout;
    }
    /**
     * How long (in milliseconds) to keep the dynamic {@link Thread Threads} in the `ThreadPool` active after completing a task before terminating them.
     * {@link minThreads} number of `Thread`s have their {@link Thread.idleTimeout} set to `Infinity`. All other threads will have their `Thread.idleTimeout` set to this value.
     * This allows the `ThreadPool` to grow and shrink based upon demand, using more or less resources as required.
     * Default is `0` (close immediately).
     * Changing this value will restart the `ThreadPool`'s internal timer.
     * @default 0
     * @throws `RangeError` if value < 0
     */
    public set idleTimeout(value: number) {
        for (let i = this.minThreads; i < this.threads.length; i++) {
            this.threads[i]!.idleTimeout = value
        }
        this._idleTimeout = value;
    }

    /**
     * The number of {@link Thread Threads} in the pool that are currently running tasks. Once this number reaches `0`, it is safe to close the `ThreadPool`.
     * It is possible the check this while a task is still running. Their statuses are stored on the main thread while the tasks are performed on the underlying workers.
     * To wait until the `ThreadPool` is not busy, await the {@link idle} property.
     * @example
     * ```ts
     * import { ThreadPool } from "./threadpool";
     * const tp = new ThreadPool(() => {
     *     return 'hello world'
     * })
     * 
     * tp.run([])
     * console.log(`${tp.busy} thread in the ThreadPool is busy.`)
     * tp.run([])
     * console.log(`${tp.busy} threads in the ThreadPool are busy.`)
     * await tp.idle
     * console.log(`${tp.busy} threads in the ThreadPool are busy.`)
     * tp.close()
     * ```
     */
    public get busy(): number {
        return this.threads.filter((t) => t.busy).length
    }

    /**
     * A promise that resolves once all of the {@link Thread Threads} in the `ThreadPool` have finished their tasks and reached an `idle` state. Resolves immediately if no `Thread`s are busy.
     * Works similar to the {@link Thread.idle} property, except that the promise resolves to void.
     * @see [Thread.idle](./docs/classes/Thread.html#idle)
     */
    public get idle(): Promise<void> {
        return Promise.all(this.threads.map((t) => { return t.idle })).then(() => {
            return undefined
        })
    }

    /**
     * Create a new `ThreadPool` to group worker threads together and run multiple worker threads in parallel.
     * @param fn
     * The callback function to be executed in parallel upon calling the asynchronous {@link run} method.
     * Argument types must be serializable using the {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types structuredClone()} algorithm.
     * Callback functions can not be closures or rely upon top level imports, as they do not have access to variables or imports outside of their isolated worker thread environment.
     * They can however use dynamic imports using the `const myPackage = await import('some_package')` syntax.
     */
    constructor(fn: T, options?: ThreadPoolOptions) {

        this.threads = []
        this.minThreads = options?.minThreads ?? 1
        this.maxThreads = options?.maxThreads ?? availableParallelism() - 1
        this.idleTimeout = options?.idleTimeout ?? 0
        
        for (let i: number = 0; i < this.minThreads; i++) {
            this.threads[i] = new Thread<T>(fn, { idleTimeout: Infinity })
        }
        for (let i = this.minThreads; i < this.maxThreads; i++) {
            this.threads[i] = new Thread<T>(fn, { idleTimeout: this.idleTimeout })
        }
        this.fn = fn
    }

    /** {@inheritDoc Thread.run} */
    public async run(args: Parameters<T>): Promise<ReturnType<T>> {

        // run through a decision tree to select which thread to use, prevents just reusing the same thread over and over
        let winner: Thread<T> | undefined

        // prefer a thread whose worker isn't closed and isn't busy
        winner = this.threads.find((t) => {
            return !t.busy && !t.closed
        })

        // next preference is a thread who is closed but not busy
        if (typeof winner === 'undefined') {
            winner = this.threads.find((t) => {
                return !t.busy
            })
        }

        // worst case scenario, enqueue it until a thread becomes available
        if (typeof winner === 'undefined') {
            winner = await Promise.race(this.threads.map((t) => {
                return t.idle
            }))
        }

        return winner.run(args)
    }

    /**
     * Close all of the {@link Thread Threads} in the pool. It is safe to call this method more than once, as subsequent calls result in a no-op.
     * @param [force=false] This method will wait for the `Thread` to finish its queued tasks unless `force` is set to `true`. Default is `false`.
     * @returns a Promise\<number\> that resolves to the amount of open threads that were actually closed (how many `Thread.close()` calls returned `true`).
     * @example
     * ```ts
     * import { ThreadPool } from "./threadpool"
     * 
     * const threadPool = new ThreadPool(() => { return 42 })
     * console.log('The answer is:', await threadPool.run([]))
     * threadPool.close() // not calling close may cause the program to hang
     * ```
     */
    public async close(force: boolean = false): Promise<number> {
        return Promise.all(this.threads.map(async (t) => {
            return t.close(force)
        })).then((boolArr) => {
            return boolArr.filter(bool => bool).length
        })
    }

}
