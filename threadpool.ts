// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { EventEmitter } from "events";
import { availableParallelism } from "os";
import { Thread, type ThreadOptions } from "./thread";

export interface ThreadPoolOptions extends ThreadOptions {
    /**
     * The minimum number of threads to keep active at any given time.
     * By default, one thread will be kept warm for fast startup and execution times.
     * @default 1
     */
    minThreads?: number,
    /**
     * The maximum amount of threads that are allowed to be running at once. Once this limit is reached, any further calls will be enqueued until a thread becomes available.
     * By default, the maximum is set to `os.availableParallelism()`, which generally should not be exceeded, as it will not offer any performance gains.
     * @default os.availableParallelism()
     */
    maxThreads?: number
}

/**
 * The default amount of time to wait for a thread in the threadpool to be idle before closing its underlying worker.
 * @ignore
 */
export const DEFAULT_IDLE_TIMEOUT: number = 60_000

export class ThreadPool<T = any> extends EventEmitter {
    private threads: Thread<T>[]

    private _fn: (...args: any) => T
    public get fn(): (...args: any) => T {
        return this._fn
    }
    public set fn(value: (...args: any) => T) {
        for (let i = 0; i < this.threads.length; i++) {
            this.threads[i]!.fn = value
        }
        this._fn = value
    }

    private _minThreads!: number
    public get minThreads(): number {
        return this._minThreads
    }
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
    public get maxThreads(): number {
        return this._maxThreads
    }
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
    public get idleTimeout(): number {
        return this._idleTimeout;
    }
    public set idleTimeout(value: number) {
        for (let i = this.minThreads; i < this.threads.length; i++) {
            this.threads[i]!.idleTimeout = value
        }
        this._idleTimeout = value;
    }

    constructor(fn: (...args: any) => T, options?: ThreadPoolOptions) {
        super()

        this.threads = []
        this.minThreads = options?.minThreads ?? 1
        this.maxThreads = options?.maxThreads ?? availableParallelism()
        this.idleTimeout = options?.idleTimeout ?? DEFAULT_IDLE_TIMEOUT
        
        for (let i: number = 0; i < this.minThreads; i++) {
            this.threads[i] = new Thread<T>(fn, { idleTimeout: Infinity })
        }
        for (let i = this.minThreads; i < this.maxThreads; i++) {
            this.threads[i] = new Thread<T>(fn, { idleTimeout: this.idleTimeout })
        }
        this._fn = fn
    }

    public async run(...args: any): Promise<T> {

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

        return winner.run(...args)
    }

    public async close(): Promise<void> {
        await Promise.all(this.threads.map(async (t) => { return t.close()} ))
    }

}
