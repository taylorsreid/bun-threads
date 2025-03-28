// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import EventEmitter from 'node:events'
import { availableParallelism as osAvailableParallelism } from 'node:os'
import { Thread } from './thread'

/**
 * Returns an estimate of the default amount of parallelism a program should use. Always returns a value greater than zero.
 * @returns 
 */
export const availableParallelism: () => number = () => {
    return osAvailableParallelism()
}

export class ThreadPool<T = any> extends EventEmitter {
    
    private fn: (...args: any) => T

    private _minThreads: number
    public get minThreads(): number {
        return this._minThreads
    }
    public set minThreads(value: number) {
        if(value < 0 || !Number.isInteger(value)) {
            throw new RangeError(`minThreads must be set to a positive integer greater than or equal to 0. Received ${value}`)
        }
        this._minThreads = value
    }

    private _maxThreads: number
    public get maxThreads(): number {
        return this._maxThreads
    }
    public set maxThreads(value: number) {
        if(value < 1 || !Number.isInteger(value)) {
            throw new RangeError(`maxThreads must be set to a positive integer greater than or equal to 1. Received ${value}`)
        }
        else if(value < this.minThreads) {
            throw new RangeError(`maxThreads must be set to greater than or equal to the value of minThreads. minThreads is currently set to ${this.minThreads}. Received ${value} for maxThreads.`)
        }
        this._maxThreads = value
    }

    private threads: Thread<T>[]
    
    constructor(fn: (...args: any) => T, options: {
        /**
         * The minimum number of threads to keep active at any given time.
         * By default, one thread will be kept warm for fast startup and execution times.
         * @default 1
         */
        minThreads?: number,
        maxThreads?: number
    }) {
        super()
        this.fn = fn

        this._minThreads = options.minThreads ??= 1
        this._maxThreads = options.maxThreads ??= osAvailableParallelism()

        this.threads = []
        for (let i: number = 0; i < options.minThreads; i++ ) {
            this.threads[i] = new Thread<T>(fn)
        }
    }
}
