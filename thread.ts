// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { EventEmitter } from "events";
import { Worker } from "worker_threads";

export interface ThreadOptions {
    /**
     * How long (in milliseconds) to leave an inactive thread open before automatically terminating it.
     * Closing the thread will free up the CPU core after finishing the task, but will slightly increase startup times if the thread is reused later.
     * The thread can still be closed manually by calling the asynchronous {@link close()} method.
     * Set this to 0 to close the thread immediately after completing its task, or to Infinity (or leave undefined to default to Infinity) to leave the thread open until it goes out of scope.
     * @default Infinity
     */
    idleTimeout?: number
}

/**
 * Abstraction around Bun workers to enable working with them as promises.
 * @typeParam T - The return type of your callback function. Defaults to any, but can be given a type to improve type checking and intellisense.
 */
export class Thread<T = any> extends EventEmitter {
    private worker: Worker | undefined
    private timer: Timer | undefined

    private _queued: number;
    /**
     * How many tasks are currently waiting to use the thread.
     * 
     * Every time you call the {@link run()} method, this value is incremented by 1.
     * 
     * Every time the {@link run()} method resolves to a value, this value is decremented by 1.
     */
    public get queued(): number {
        return this._queued;
    }
    private set queued(value: number) {
        if (value < 0) {
            throw new RangeError(`Internal state 'queued' must be a value >= 0. Received: ${value}`)
        }
        else if (value === 0) {
            this.emit('idle')
            if (this.idleTimeout !== Infinity) {
                this.timer = setTimeout(async () => await this.close(), this.idleTimeout)
            }
        }
        else if (this.queued === 0 && (value > 0)) {
            clearTimeout(this.timer)
            this.emit('busy')
        }
        this._queued = value;        
    }

    /**
     * Whether the thread is currently busy running a task or not. It is possible the check this while a task is still running.
     * The status is stored on the main thread while the task is performed on the underlying worker. To wait until the thread is not busy, await the {@link idle} property.
     */
    public get busy(): boolean {
        return this.queued > 0
    }

    /**
     * A unique integer identifier for the referenced thread. May be undefined if the underlying worker is currently closed.
     */
    public get id(): number | undefined {
        return this.worker?.threadId
    }

    private _fn!: (...args: any) => T;
    /**
     * The callback function to be executed in parallel upon calling the {@link run()} method.
     * Argument types must be serializable using the {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types structuredClone()} algorithm.
     * Callback functions can not be closures or rely upon top level imports, as they do not have access to variables or imports outside of their isolated worker thread environment.
     * They can however use dynamic imports.
     */
    public get fn(): (...args: any) => T {
        return this._fn;
    }
    public set fn(value: (...args: any) => T) {
        // if the worker isn't closed, update the function
        if (typeof this.worker !== 'undefined') {
            this.worker.postMessage({
                action: 'set',
                data: value.toString()
            })
        }
        this._fn = value;
    }

    private _idleTimeout!: number;
    /**
     * How long in milliseconds to leave an inactive thread open before automatically terminating it.
     * Closing the thread will free up the CPU core after finishing the task, but will slightly increase startup times if the thread is reused later.
     * The thread can still be closed manually by calling the asynchronous {@link close()} method.
     * Set this to 0 to close the thread immediately after completing its task, or to Infinity (or leave undefined to default to Infinity) to leave the thread open until it goes out of scope.
     * Changing this value will restart the thread's internal timer.
     * @default Infinity
     * @throws `RangeError` if value < 0
     */
    public get idleTimeout(): number {
        return this._idleTimeout;
    }
    public set idleTimeout(value: number) {
        if (value < 0) {
            throw new RangeError(`idleTimeout must be between 0 (inclusive) and Infinity. Received ${value}`)
        }
        if (!this.closed) {
            clearTimeout(this.timer)
            if (value !== Infinity) {
                this.timer = setTimeout(async () => await this.close(), this.idleTimeout)
            }
        }
        this._idleTimeout = value;
    }

    /**
     * Whether the threads underlying worker is currently instantiated or not.
     */
    public get closed(): boolean {
        return typeof this.worker === 'undefined'
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
     * // you can use the idle property to get the **thread** that finishes first, not the result
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
     * The callback function to be executed in parallel upon calling the asynchronous {@link run()} method.
     * Argument types must be serializable using the {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types structuredClone()} algorithm.
     * Callback functions can not be closures or rely upon top level imports, as they do not have access to variables or imports outside of their isolated worker thread environment.
     * They can however use dynamic imports.
     * @param options Configuration options for the thread.
     * @example
     * ```ts
     * const threadWithImports: Thread<Promise<void>> = new Thread(async (num: number) => {
     *      const sqlite = await import('bun:sqlite')
     *      const db = new sqlite.Database('./db.sqlite')
     *      db.run("INSERT INTO answers VALUES(?)", [ num ])
     * })
     * ```
     */
    constructor(fn: (...args: any) => T, options?: ThreadOptions) {
        super()
        this.fn = fn
        this.idleTimeout = options?.idleTimeout ?? Infinity
        this._queued = 0 // bypass setter to avoid emitting idle state
    }

    /**
     * Execute the callback that was specified in the constructor and/or the .fn property, in a separate worker thread.
     * @param args The arguments to pass to the callback function.
     * Argument types must be serializable using the {@link https://developer.mozilla.org/en-US/docs/Web/API/Web_Workers_API/Structured_clone_algorithm#supported_types structuredClone()} algorithm.
     * @returns A Promise\<T\> where T is the return type of your callback function.
     */
    public async run(...args: any): Promise<T> {
        return new Promise<T>((resolve, reject) => {
            // increment the current task queue number, this has the side effect of emitting busy and idle, and resetting the idle timeout when appropriate
            this.queued++

            // check if the worker has closed, and if it has, create a new one and update the function
            if (typeof this.worker === 'undefined') {
                this.worker = new Worker('./worker.ts')
                this.worker.postMessage({
                    action: 'set',
                    data: this.fn.toString()
                })
            }

            // create a unique id for each request to ensure that each promise only resolves for the correct request
            const id: string = crypto.randomUUID()

            // function to check each message from the worker thread
            const check = async (event: any) => {
                if (event.id === id) {
                    this.worker!.removeListener('message', check)

                    if (event.action === 'resolve') {
                        resolve(event.data)
                    }
                    else if (event.action === 'reject') {
                        reject(event.data)
                    }
                    else {
                        reject(new Error('An unexpected error occured within the worker. This may indicate a bug in bun-threads.'))
                    }
                    
                    // decrement the task queue number
                    this.queued--
                }
            }

            // setup event listener
            this.worker.on('message', check)

            // dispatch data to worker
            this.worker.postMessage({
                id: id,
                action: 'call',
                data: args
            })
        })
    }

    /**
     * Terminate the underlying worker. It is safe to call this method more than once, as subsequent calls result in a no-op.
     * @param [force=false] false by default. This method will wait for the thread to finish its queued tasks unless `force` is set to true.
     * @see {@link busy}, {@link idle}, and/or {@link queued} on how to check first whether the thread has completed its task.
     * @returns A boolean whether the underlying worker was actually terminated. True if the worker was terminated, false if the worker was already terminated (a no-op).
     * @example
     * ```ts
     * const thread = new Thread(() => { return 42 })
     * console.log('The answer is:', await thread.run())
     * await thread.close() // not calling close() may cause the program to hang
     * ```
     */
    public async close(force: boolean = false): Promise<boolean> {
        if (typeof this.worker !== 'undefined') {
            if (!force) {
                await this.idle
            }
            clearTimeout(this.timer) // not clearing causes the program to hang and not exit
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
    public on(eventName: 'idle', listener: () => void): this
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
     * }, { idleTimeout: 60_000 })
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
    public once(eventName: 'idle', listener: () => void): this
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
     * }, { idleTimeout: 10_000 })
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
     * }, { idleTimeout: 30_000 })
     * 
     * sumThread.once('close', () => console.log('sumThread has finished operation and is shutting down...'))
     * sumThread.run(0, 1_000_000).then((sum: number) => console.log(sum))
     * ```
     */
    public once(eventName: 'close', listener: () => void): this
    public once(eventName: string | symbol, listener: (...args: any) => void): this {
        return super.on(eventName, listener)
    }

    public prependListener(eventName: 'idle', listener: () => void): this
    public prependListener(eventName: 'busy', listener: () => void): this
    public prependListener(eventName: 'close', listener: () => void): this
    public prependListener(eventName: string | symbol, listener: (...args: any) => void): this {
        return super.prependListener(eventName, listener)
    }

    public prependOnceListener(eventName: 'idle', listener: () => void): this
    public prependOnceListener(eventName: 'busy', listener: () => void): this
    public prependOnceListener(eventName: 'close', listener: () => void): this
    public prependOnceListener(eventName: string | symbol, listener: (...args: any) => void): this {
        return super.prependOnceListener(eventName, listener)
    }

    // // only used in development for intellisense
    // public emit(eventName: 'idle'): boolean
    // public emit(eventName: 'busy'): boolean
    // public emit(eventName: 'close'): boolean
    // public emit(eventName: string | symbol, ...args: any): boolean {
    //     return super.emit(eventName, ...args)
    // }

}
