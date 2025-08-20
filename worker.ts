// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { parentPort } from "worker_threads";

interface WorkerSetRequest {
    action: 'set',
    data: string
}

interface WorkerCallRequest {
    action: 'call',
    id: string,
    data: any[]
}

type WorkerRequest = WorkerSetRequest | WorkerCallRequest

interface WorkerResolveResponse {
    id: string,
    action: 'resolve',
    data: any
}

interface WorkerRejectResponse {
    id: string,
    action: 'reject',
    data: Error
}

export type WorkerResponse = WorkerResolveResponse | WorkerRejectResponse

const AsyncFunction = async function () { }.constructor

function getFunctionArgumentNames(fn: string | Function): string[] {
    if (typeof fn === 'function') {
        fn = fn.toString()
    }
    return fn.substring(fn.indexOf('(') + 1, fn.indexOf(')')).split(',')
}

function getFunctionBody(fn: string | Function): string {
    if (typeof fn === 'function') {
        fn = fn.toString()
    }
    if (fn.endsWith('}')) { // it's a function
        // chop off the starting and ending brackets
        return fn.substring(fn.indexOf('{') + 1, fn.length - 1).trim()
    }
    else { // it's an expression
        // chop off the '() =>' or 'async () =>' then make it into a function that just returns the expression
        return 'return ' + fn.substring(fn.indexOf('=>') + 2).trim()
    }
}

let fn: Function

// TODO: switch to native Bun Worker API once it becomes stable
parentPort?.on('message', async (event: WorkerRequest) => {
    try {
        if (event.action === 'set') {
            const fnArgNames: string[] = getFunctionArgumentNames(event.data)
            let fnBody: string = getFunctionBody(event.data)
            let fnIsAsync: boolean = event.data.startsWith('async')
            if (fnBody.includes('SharedValue') && (!fnBody.includes('import("bun-threads")'))) {
                fnBody = `const { SharedValue, SharedValueServer } = await import("${import.meta.dir}/sharedvalue");\n` + fnBody
                fnIsAsync = true
            }
            fn = fnIsAsync ? AsyncFunction(...fnArgNames, fnBody) : Function(...fnArgNames, fnBody)
        }
        else if (event.action === 'call') {
            parentPort?.postMessage({
                id: event.id,
                action: 'resolve',
                data: await fn.call(undefined, ...event.data)
            })
        }
        else {
            throw new Error(`An unexpected error occured within the worker. Instruction "${event}" from main thread is not defined in this context.`)
        }
    } catch (error) {
        parentPort?.postMessage({
            id: 'id' in event ? event.id : undefined,
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
