import { isTypedArray } from "util/types";

export function isStructuredCloneable(value: any) {
    return value instanceof Array ||
           value instanceof ArrayBuffer ||
           value instanceof Boolean ||
           value instanceof DataView ||
           value instanceof Date ||
           value instanceof Error ||
           value instanceof Map ||
           value instanceof Number ||
           value?.constructor === Object ||
           value === null ||
           typeof value === 'undefined' ||
           typeof value === 'boolean' ||
           typeof value === 'number' ||
           typeof value === 'bigint' ||
           typeof value === 'string' ||
           value instanceof RegExp ||
           value instanceof Set ||
           value instanceof String ||
           isTypedArray(value)
}

type BaseStructuredClonable = ArrayBuffer | Boolean | DataView | Date | Error | Number | null | undefined | boolean | number | bigint | string | RegExp | String |
    Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float16Array | Float32Array | Float64Array | BigInt64Array | BigUint64Array
type MultiStructuredClonable = Array<BaseStructuredClonable> | Map<BaseStructuredClonable, BaseStructuredClonable> | { [key: string | symbol]: BaseStructuredClonable } | Set<BaseStructuredClonable>
export type StructuredClonable = BaseStructuredClonable & MultiStructuredClonable

export interface WorkerSetRequest {
    action: 'set',
    data: string
}

export interface WorkerCallRequest {
    action: 'call',
    id: string,
    data: any[]
}

export type WorkerRequest = WorkerSetRequest | WorkerCallRequest

export interface WorkerResolveResponse {
    id: string,
    action: 'resolve',
    data: any
}

export interface WorkerRejectResponse {
    id: string,
    action: 'reject',
    data: Error
}

export type WorkerResponse = WorkerResolveResponse | WorkerRejectResponse

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