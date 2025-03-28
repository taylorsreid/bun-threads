// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

// prevents TS errors
declare var self: Worker;

const AsyncFunction = async function () {}.constructor

// @ts-ignore
self.onmessage = async (event: MessageEvent) => {
    const funcString: string = event.data.fn
    const argNames: string[] = funcString.substring(funcString.indexOf('(') + 1, funcString.indexOf(')')).split(',')
    const funcBody: string = funcString.substring(funcString.indexOf('{') + 1, funcString.length-1).trim()
    try {
        if (funcString.startsWith('async')) {
            postMessage({
                type: 'success',
                data: await AsyncFunction(...argNames, funcBody).call(undefined, ...event.data.args)
            })
        }
        else {
            postMessage({
                type: 'success',
                data: Function(...argNames, funcBody).call(undefined, ...event.data.args)
            })
        }
    } catch (error) {
        postMessage({
            type: 'failure',
            data: error
        })
    }
};