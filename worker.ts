// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { Mutex } from "async-mutex";
import { BroadcastChannel, parentPort } from "worker_threads";
import { AsyncFunction, getFunctionArgumentNames, getFunctionBody, type WorkerRequest } from "./util";

// prevents TS errors
// declare var self: Worker;
// self.threadId

let bc: BroadcastChannel
let fn: Function
let pendingPromises: Promise<any>[] = []

let $this: {
    [key: string]: {
        ownerId: number | null
        mutex: Mutex
        data: any
    }
} = {}

// TODO: switch to native Bun Worker API once it becomes stable
parentPort?.on('message', async (event: WorkerRequest) => {
    try {
        if (event.action === 'init') {
            if (event.data.$this) {
                const $thisArgNames: string[] = getFunctionArgumentNames(event.data.$this.fn)
                const $thisBody: string = getFunctionBody(event.data.$this.fn)
                const $thisIsAsync: boolean = event.data.$this.fn.startsWith('async')
                let kv: { [key: string]: any }
                if ($thisIsAsync) {
                    const $thisProm: Promise<{ [key: string]: any }> = AsyncFunction(...$thisArgNames, $thisBody).call(undefined, ...event.data.$this.args)//.then((result: { [key: string]: any }) => { $this = result })
                    pendingPromises.push($thisProm)
                    kv = await $thisProm
                }
                else {
                    kv = Function(...$thisArgNames, $thisBody).call(undefined, ...event.data.$this.args)
                }
                for (let [k, v] of Object.entries(kv)) {
                    $this[k] = {
                        mutex: new Mutex(),
                        ownerId: null,
                        data: v
                    }
                }
            }

            if (event.id) {
                bc = new BroadcastChannel(event.id)
            }

            const fnArgNames: string[] = getFunctionArgumentNames(event.data.fn)
            const fnBody: string = getFunctionBody(event.data.fn).replaceAll('$this', 'this')
            const fnIsAsync: boolean = event.data.fn.startsWith('async')
            if (fnIsAsync) {
                fn = AsyncFunction(...fnArgNames, fnBody)
            }
            else {
                fn = Function(...fnArgNames, fnBody)
            }
        }
        else if (event.action === 'call') {
            await Promise.allSettled(pendingPromises) // prevents calling fn before $this is set
            parentPort?.postMessage({
                id: event.id,
                action: 'resolve',
                data: await fn.call($this, ...event.data)
            })
        }
        else {
            throw new Error(`An unexpected error occured within the worker. Instruction "${event}" from main thread is not defined in this context.`)
        }
    } catch (error) {
        parentPort?.postMessage({
            id: event.id,
            action: 'reject',
            data: function () { // return more helpful error messages for common errors
                if (error instanceof ReferenceError) {
                    error.message += `.\nThis is usually caused by referencing top level imports within your Thread or ThreadPool's callback function.\nOnly dynamic imports made inside of the Thread's callback function are supported.\nPlease see the README for examples.`
                }
                else if (error instanceof TypeError && error.message === 'Spread syntax requires ...iterable not be null or undefined') {
                    error.message += `.\nThis is usually caused by not passing an argument to Thread.run() or ThreadPool.run().\nIf your callback function does not have arguments, you still must pass an empty array.\nThis is required for TypeScript to be able infer arguments.`
                }
                return error
            }()
        })
    }

})
