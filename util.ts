// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

export const AsyncFunction = async function () { }.constructor

export function getFunctionArgumentNames(fn: string | Function): string[] {
    if (typeof fn === 'function') {
        fn = fn.toString()
    }
    return fn.substring(fn.indexOf('(') + 1, fn.indexOf(')')).split(',')
}

export function getFunctionBody(fn: string | Function): string {
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