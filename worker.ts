// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { parentPort } from "worker_threads";

const AsyncFunction = async function () { }.constructor
let fn: Function

// TODO: switch to native Bun Worker API once it becomes stable
parentPort?.on('message', async (event: any) => {
    if (event.action === 'set') {

        // Get the names of the arguments passed in.
        const argNames: string[] = event.data.substring(event.data.indexOf('(') + 1, event.data.indexOf(')')).split(',')

        let funcBody: string

        if ((event.data as string).endsWith('}')) { // it's a function
            // chop off the starting and ending brackets
            funcBody = (event.data as string).substring((event.data as string).indexOf('{') + 1, event.data.length - 1).trim()
        }
        else { // it's an expression
            // chop off the '() =>' or 'async () =>' then make it into a function that just returns the expression
            funcBody = 'return ' + (event.data as string).substring((event.data as string).indexOf('=>') + 2).trim()
        }

        // determine if it's a synchronous or asynchronous function
        if (event.data.startsWith('async')) {
            fn = AsyncFunction(...argNames, funcBody)
        }
        else {
            fn = Function(...argNames, funcBody)
        }
    }
    else if (event.action === 'call') {
        try {
            parentPort?.postMessage({
                id: event.id,
                action: 'resolve',
                data: await fn.call(undefined, ...event.data)
            })
        } catch (error) {
            parentPort?.postMessage({
                id: event.id,
                action: 'reject',
                data: function(){ // return more helpful error messages for common errors
                    if (error instanceof ReferenceError) {
                        return new ReferenceError(error.message + `.\nThis is usually caused by referencing top level imports within your Thread or ThreadPool's callback function.\nOnly dynamic imports made inside of the Thread's callback function are supported.\nPlease see the README for examples.`)
                    }
                    else if (error instanceof TypeError && error.message === 'Spread syntax requires ...iterable not be null or undefined'){
                        return new TypeError(error.message + `.\nThis is usually caused by not passing an argument to Thread.run() or ThreadPool.run().\nIf your callback function does not have arguments, you still must pass an empty array.\nThis is required for TypeScript to be able infer arguments.`)
                    }
                    return error
                }()
            })
        }
    }
    else {
        parentPort?.postMessage({
            id: event.id,
            action: 'reject',
            data: new Error(`An unexpected error occured within the worker. Instruction "${event.action}" from main thread is not defined in this context.`)
        })
    }
})