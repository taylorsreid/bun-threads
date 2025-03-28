// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// prevents TS errors
declare var self: Worker;

const AsyncFunction = async function () {}.constructor

let isAsync: boolean
let fn: Function

// @ts-ignore
self.onmessage = async (event: MessageEvent) => {
    if (event.data.type === 'set') {
        const funcString: string = event.data.data
        const argNames: string[] = funcString.substring(funcString.indexOf('(') + 1, funcString.indexOf(')')).split(',')
        const funcBody: string = funcString.substring(funcString.indexOf('{') + 1, funcString.length-1).trim()
        if (funcString.startsWith('async')) {
            isAsync = true
            fn = AsyncFunction(...argNames, funcBody)
        }
        else {
            isAsync = false
            fn = Function(...argNames, funcBody)
        }
    }
    else if (event.data.type === 'call') {
        try {
            if (isAsync) {
                postMessage({
                    type: 'success',
                    data: await fn.call(undefined, ...event.data.data)
                })
            }
            else {
                postMessage({
                    type: 'success',
                    data: fn.call(undefined, ...event.data.data)
                })
            }
        } catch (error) {
            postMessage({
                type: 'failure',
                data: error
            })
        }
    }

    
};