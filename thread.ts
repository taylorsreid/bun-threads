// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { EventEmitter } from "events";

/**
 * Abstraction around Bun workers to enable working with them as promises.
 * @typeParam T - The return type of your callback function. Defaults to any, but can be given a type to improve type checking and intellisense.
 * @author Taylor Reid
 */
export class Thread<T = any> extends EventEmitter {

    private fn: (...args: any) => T
    private autoClose: boolean
    private worker: Worker | undefined

    private _closed: boolean
    /**
     * Whether the threads underlying worker is currently instantiated or not.
     */
    public get closed(): boolean {
        return this._closed
    }

    private _busy: boolean
    /**
     * Whether the thread is currently busy running its assigned task or not. It is possible the check this while a task is still running.
     * The status is stored on the main thread while the task is performed on the underlying worker. To wait until the thread is not busy, await the .idle property.
     */
    public get busy(): boolean {
        return this._busy
    }

    /**
     * A promise that resolves once the thread has finished its task and reached an idle state. Resolves immediately if the thread is not busy. Used by threadpools.
     * @example
     * const countUp: Thread<number> = new Thread<number>((countUpTo: number) => {
     *      let current: number = 0
     *      for (let i = 0; i <= countUpTo; i++) {
     *          current = i
     *      }
     *      return current
     * })
     * 
     * const countDown: Thread<number> = new Thread<number>((countDownFrom: number) => {
     *      let current: number = countDownFrom
     *      for (let i = countDownFrom; i >= 0; i--) {
     *          current = i
     *      }
     *      return current
     * })
     * 
     * countUp.run(1_000_000)
     * countDown.run(1_000_000)
     * 
     * // you can use the .idle property to get the **thread** that finishes first, not the result
     * Promise.race([countUp.idle, countDown.idle]).then((winner: Thread<number>) => {
     *      // do it again
     *      winner.run(1_000_000).then(async (value: number) => {
     *          if (value === 0) {
     *              console.log('countDown was the winner')
     *          }
     *          else {
     *              console.log('countUp was the winner')
     *          }
     *      }).then(() => {
     *          countUp.close()
     *          countDown.close()
     *      })
     * })
     */
    public get idle(): Promise<this> {
        return new Promise((resolve) => {
            if (this.busy) {
                this.once('idle', () => resolve(this))
            }
            else {
                resolve(this)
            }
        })
    }

    /**
     * Create a new Thread to run tasks on a separate Bun worker thread.
     * @param fn
     * The callback function to be executed in parallel upon calling the .run(...args) method.
     * Argument types must be serializable using the structuredClone() algorithm.
     * Callback functions can not be closures or rely upon top level imports, as they do not have access to variables or imports outside of their isolated worker thread environment.
     * They can however use dynamic imports.
     * @see [Structured Clone Algorithm - Supported Types - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types)
     * @example
     * ```ts
     * const threadWithImports: Thread<Promise<void>> = new Thread(async (num: number) => {
     *      const sqlite = await import('bun:sqlite')
     *      const db = new sqlite.Database('./db.sqlite')
     *      db.run("INSERT INTO answers VALUES(?)", [ num ])
     * })
     * ```
     * @param options Configuration options for the thread.
     */
    constructor(fn: (...args: any) => T, options?: {
        /**
         * Whether to terminate the worker thread automatically after .run(...args) has been called.
         * This will free up the CPU core after finishing the task, but will increase startup times if the thread is reused.
         * The thread can still be closed manually by calling the asynchronous .close() method.
         * @default false
         */
        autoClose?: boolean
    }) {
        super()
        this.fn = fn
        options ??= {}
        options.autoClose ??= false
        this.autoClose = options.autoClose
        this._closed = true
        this._busy = false
    }

    /**
     * Execute the callback that was specified in the constructor in a separate worker thread.
     * @param args The arguments to pass to the callback function. Argument values must be serializable using the structuredClone() algorithm.
     * @see [Structured Clone Algorithm - Supported Types - MDN](https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types)
     * @returns A Promise\<T\> where T is the return type of your callback function.
     */
    public async run(...args: any): Promise<T> {

        if (typeof this.worker === 'undefined') {
            this.worker = new Worker('./worker.ts')
            this._closed = false
        }

        this._busy = true
        this.emit('busy')

        this.worker.postMessage({
            fn: this.fn.toString(),
            args: args
        })

        return new Promise<T>((resolve, reject) => {
            // @ts-ignore
            this.worker.onmessage = async (event: MessageEvent) => {
                resolve(event.data)
                this.emit('idle', event.data)
            }
            // @ts-ignore
            this.worker.onerror = async (event: MessageEvent) => {
                reject(event.data)
                this.emit('idle', event.data)
            }
        }).finally(async () => {
            if (this.autoClose) {
                await this.close()
            }
            this._busy = false
        })
    }

    /**
     * Terminate the underlying worker. This may close it before it has completed its operation. It is safe to call this method more than once, as subsequent calls result in a no-op.
     * @see {@link busy} and {@link idle} on how to check first whether the thread has completed its task.
     * @returns A boolean whether the underlying worker was actually terminated. True if the worker was terminated, false if the worker was already terminated (a no-op).
     */
    public async close(): Promise<boolean> {
        if (typeof this.worker !== 'undefined') {
            this._closed = true
            this.emit('close')
            await this.worker.terminate() // Bun returns undefined instead of the status code. Upstream bug.
            this.worker = undefined
            return true
        }
        return false
    }

    /**
     * Adds the `listener` function to the end of the listeners array for the `idle` event. This event fires every time a thread has completed its task and is ready for another run() call.
     * No checks are made to see if the `listener` has already been added.
     * Multiple calls passing the same combination of `idle` and `listener` will result in the `listener` being added, and called, multiple times.
     * By default, event listeners are invoked in the order they are added. The `emitter.prependListener()` method can be used as an alternative to add the
     * event listener to the beginning of the listeners array.
     * @returns A reference to the `EventEmitter`, so that calls can be chained.
     * @example
     * ```ts
     * const queue: number[][] = [ [1,2], [2,3], [3,4] ]
     * 
     * const thread: Thread<number> = new Thread<number>((a: number, b: number) => {
     *      return a + b
     * })
     * 
     * thread.on('idle', async () => {
     *      const next: number[] | undefined = queue.pop()
     *      if (next) {
     *          const result: number = await thread.run(next[0], next[1])
     *          console.log(result)
     *      }
     * })
     * 
     * const first: number[] | undefined = queue.pop()
     * 
     * if (first) {
     *      const result: number = await thread.run(first[0], first[1])
     *      console.log(result) // prints out 7, 5, 3 on separate lines
     * }
     * ```
     */
    public on(eventName: 'idle', listener: (data: T) => void): this
    /**
     * Adds the `listener` function to the end of the listeners array for the `busy` event. This event fires every time a thread has begun its assigned task.
     * No checks are made to see if the `listener` has already been added.
     * Multiple calls passing the same combination of `busy` and `listener` will result in the `listener` being added, and called, multiple times.
     * By default, event listeners are invoked in the order they are added. The `emitter.prependListener()` method can be used as an alternative to add the
     * event listener to the beginning of the listeners array.
     * @returns A reference to the `EventEmitter`, so that calls can be chained.
     * @example
     * ```ts
     * const countOccurences: Thread<number> = new Thread<number>((char: string, inString: string) => {
     *      let occurences: number = 0
     *      for (let i = 0; i < inString.length; i++) {
     *          if (inString[i] === char) {
     *              occurences++
     *          }
     *      }
     *      return occurences
     * })
     * 
     * countOccurences.on('busy', () => {
     *      console.log('Begun counting occurences in a separate thread.')
     * })
     * 
     * console.log(await countOccurences.run('o', 'hello world'))
     * console.log(await countOccurences.run('e', 'Answer to the Ultimate Question of Life, The Universe, and Everything'))
     * await countOccurences.close()
     * ```
     */
    public on(eventName: 'busy', listener: () => void): this
    /**
     * Adds the `listener` function to the end of the listeners array for the `close` event. This event fires when a thread has closed its underlying worker object.
     * A thread can still be reused by calling run() again, but will have longer startup times vs. not closing it before calling run() again, as a worker has to be created again after closing.
     * No checks are made to see if the `listener` has already been added.
     * Multiple calls passing the same combination of `close` and `listener` will result in the `listener` being added, and called, multiple times.
     * By default, event listeners are invoked in the order they are added. The `emitter.prependListener()` method can be used as an alternative to add the
     * event listener to the beginning of the listeners array.
     * @returns A reference to the `EventEmitter`, so that calls can be chained.
     * @example
     * ```ts
     * const scramble: Thread<string> = new Thread<string>((toScramble: string) => {
     *      const randomNumber = (min: number, max: number) => {
     *          return Math.random() * (max - min) + min;
     *      }
     *      const oldArr: string[] = toScramble.split('')
     *      const newArr: string[] = []
     *      while (oldArr.length > 0) {
     *          const rand: number = randomNumber(0, oldArr.length)
     *          newArr.push(oldArr.splice(rand, 1)[0]!)
     *      }
     *      return newArr.join('')
     * }, { autoClose: true })
     * 
     * scramble.on('close', () => {
     *      console.log('Scramble thread has completed its work and has closed.')
     * })
     * 
     * console.log(await scramble.run('hello world')) // outputs a randomly rearranged 'hello world'
     * ```
     */
    public on(eventName: 'close', listener: () => void): this
    public on(eventName: string | symbol, listener: (...args: any) => void): this {
        return super.on(eventName, listener)
    }

    /**
     * Adds a **one-time** `listener` function for the event named `idle`. The next time `idle` is triggered, this listener is removed and then invoked.
     * This event fires once a thread has completed its task and is ready for another run() call. The return value of the operation is also included for convenience and as an alternative to using promises.
     * By default, event listeners are invoked in the order they are added. The `emitter.prependOnceListener()` method can be used as an alternative to add the
     * event listener to the beginning of the listeners array.
     * @returns A reference to the `EventEmitter`, so that calls can be chained.
     * @example
     * ```ts
     * const reverse: Thread<string> = new Thread<string>((longStringtoReverse: string) => {
     *      return longStringtoReverse.split('').toReversed().join('')
     * })
     * 
     * reverse.once('idle', (data: string) => {
     *      console.log(`The reversed string is ${data}`)
     *      reverse.close()
     * })
     * 
     * // not awaited because the data is handled in the once listener
     * reverse.run('Answer to the Ultimate Question of Life, The Universe, and Everything')
     * console.log('doing some other work in the meantime...')
     * console.log('working...')
     * console.log('working...')
     * ```
     */
    public once(eventName: 'idle', listener: (data: T) => void): this
    /**
     * Adds a **one-time** `listener` function for the event named `busy`. The next time `busy` is triggered, this listener is removed and then invoked.
     * This event fires once a thread has begun its assigned task.
     * By default, event listeners are invoked in the order they are added. The `emitter.prependOnceListener()` method can be used as an alternative to add the
     * event listener to the beginning of the listeners array.
     * @returns A reference to the `EventEmitter`, so that calls can be chained.
     * @example
     * ```ts
     * const generate: Thread<number[]> = new Thread<number[]>((length: number, min: number = 0, max: number = 100) => {
     *      const arr: number[] = []
     *      for (let i = 0; i < length; i++) {
     *          arr.push(Math.round(Math.random() * (max - min) + min))
     *      }
     *      return arr
     * }, { autoClose: true })
     * 
     * generate.once('busy', () => {
     *      console.log('Thread is busy generating a random number array...')
     * })
     * 
     * generate.run(100).then((result: number[]) => {
     *      console.log(result)
     * })
     * console.log('Doing other work in the meantime...')
     * ```
     */
    public once(eventName: 'busy', listener: () => void): this
    /**
     * Adds a **one-time** `listener` function for the event named `close`. The next time `close` is triggered, this listener is removed and then invoked.
     * This event fires once when a thread has closed its underlying worker object.
     * By default, event listeners are invoked in the order they are added. The `emitter.prependOnceListener()` method can be used as an alternative to add the
     * event listener to the beginning of the listeners array.
     * @returns A reference to the `EventEmitter`, so that calls can be chained.
     * @example
     * ```ts
     * const sumThread: Thread<number> = new Thread<number>((start: number, end: number) => {
     *      let sum: number = 0
     *      for (let i = start; i <= end; i++) {
     *          sum += i
     *      }
     *      return sum
     * }, { autoClose: true })
     * 
     * sumThread.once('close', () => console.log('sumThread has finished operation and is shutting down...'))
     * sumThread.run(0, 1_000_000).then((sum: number) => console.log(sum))
     * ```
     */
    public once(eventName: 'close', listener: () => void): this
    public once(eventName: string | symbol, listener: (...args: any) => void): this {
        return super.on(eventName, listener)
    }

    public prependListener(eventName: 'idle', listener: (data: T) => void): this
    public prependListener(eventName: 'busy', listener: () => void): this
    public prependListener(eventName: 'close', listener: () => void): this
    public prependListener(eventName: string | symbol, listener: (...args: any) => void): this {
        return super.prependListener(eventName, listener)
    }

    public prependOnceListener(eventName: 'idle', listener: (data: T) => void): this
    public prependOnceListener(eventName: 'busy', listener: () => void): this
    public prependOnceListener(eventName: 'close', listener: () => void): this
    public prependOnceListener<K>(eventName: string | symbol, listener: (...args: any) => void): this {
        return super.prependOnceListener(eventName, listener)
    }

    // // only used in development for intellisense
    // public emit(eventName: 'idle', data: T): boolean
    // public emit(eventName: 'busy'): boolean
    // public emit(eventName: 'close'): boolean
    // public emit(eventName: string | symbol, ...args: any): boolean {
    //     return super.emit(eventName, ...args)
    // }

}