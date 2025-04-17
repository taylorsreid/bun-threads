// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { parentPort } from "worker_threads";

const AsyncFunction = async function () {}.constructor
let fn: Function

parentPort?.on('message', async (event: any) => {
    if (event.action === 'set') {
        const funcString: string = event.data
        const argNames: string[] = funcString.substring(funcString.indexOf('(') + 1, funcString.indexOf(')')).split(',')
        const funcBody: string = funcString.substring(funcString.indexOf('{') + 1, funcString.length-1).trim()
        if (funcString.startsWith('async')) {
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
                data: error
            })
        }
    }
})