// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { BroadcastChannel, type Serializable } from "worker_threads";

type BunThreadsMessage = {
    action: 'data_set',
    id: string,
    key: string,
    value: Serializable
}| {
    action: 'data_get',
    id: string,
    key: string
} | {
    action: 'data_resolve_set',
    id: string
} | {
    action: 'data_resolve_get',
    id: string,
    value: Serializable
} | {
    action: 'mutex_lock',
    id: string,
    key: string
    priority?: true
} | {
    action: 'mutex_cancel',
    id: string,
    key: string
} | {
    action: 'mutex_release',
    key: string
} | {
    action: 'mutex_exists',
    key: string
} | {
    action: 'mutex_waiting',
    key: string
} | {
    action: 'mutex_resolve_lock',
    id: string
} | {
    action: 'mutex_resolve_exists',
    key: string,
    value: boolean
} | {
    action: 'mutex_resolve_waiting',
    value: number
} | {
    action: 'mutex_reject_lock'
    id: string
}

/**
 * Thrown/rejected when an asynchronous operation times out before resolving.
 */
export class TimeoutError extends Error {
    constructor(message?: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'TimeoutError'
        Object.setPrototypeOf(this, TimeoutError.prototype)
    }
}

/**
 * Thrown/rejected by a pending Mutex.lock() promise when Mutex.cancel() is called.
 */
export class LockCancelError extends Error {
    constructor(message?: string, options?: ErrorOptions) {
        super(message, options)
        this.name = 'LockCancelError'
        Object.setPrototypeOf(this, LockCancelError.prototype)
    }
}

/**
 * Retrieve a value that is shared across threads.
 * Similar to the built in worker_thread's getEnvironmentData(), but works in and across threads (instead of just between a worker and its spawning thread) and is promise based.
 * 
 * A Coordinator class must be running somewhere in your code for this function to work. The Coordinator class can be running in any thread.
 * @param key a unique string value that can be used as an object key.
 * @param timeout how long to wait for the returned promise to resolve before rejecting. Default is 100 ms.
 * @returns a `Promise<Serializable>` that resolves to the value set for the key, or undefined if the key is not set.
 */
export async function getEnvironmentData(key: string, timeout: number = 100): Promise<Serializable> {
    return new Promise((resolve, reject) => {
        const id: string = Bun.randomUUIDv7()
        const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-coordinator`).unref()
        // @ts-ignore
        bc.onmessage = (ev: MessageEvent<BunThreadsMessage>) => {
            if (ev.data.action === 'data_resolve_get' && ev.data.id === id) {
                resolve(ev.data.value)
                bc.close()
            }
        }
        bc.postMessage({ action: 'data_get', id, key })
        Bun.sleep(timeout).then(() => {
            reject(new TimeoutError(`getEnvironmentData('${key}') timed out after ${timeout} ms. Is a Coordinator class running somewhere in your code?`))
            bc.close()
        })
    })
}

/**
 * Set a value that can be shared across threads.
 * Similar to the built in worker_thread's setEnvironmentData(), but works in and across threads (instead of just between a worker and its spawning thread) and is promise based.
 * 
 * A Coordinator class must be running somewhere in your code for this function to work. The Coordinator class can be running in any thread.
 * @param key a unique string value that can be used as an object key.
 * @param value Any arbitrary, cloneable JavaScript value that will be cloned and passed between threads.
 * @param timeout how long to wait for the returned promise to resolve before rejecting. Default is 100 ms.
 * @returns a `Promise<void>`that resolves upon receiving an acknowledgment that the key/value pair was set.
 */
export async function setEnvironmentData(key: string, value: Serializable, timeout: number = 100): Promise<void> {
    return new Promise((resolve, reject) => {
        const id: string = Bun.randomUUIDv7()
        const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-coordinator`).unref()
        // @ts-ignore
        bc.onmessage = (ev: MessageEvent<BunThreadsMessage>) => {
            if (ev.data.action === 'data_resolve_set' && ev.data.id === id) {
                resolve()
                bc.close()
            }
        }
        bc.postMessage({ action: 'data_set', id, key, value })
        Bun.sleep(timeout).then(() => {
            reject(new TimeoutError(`setEnvironmentData('${key}', ${value.toString()}) timed out after ${timeout} ms. Is a Coordinator class running somewhere in your code?`))
            bc.close()
        })
    })
}

/**
 * A mutual exclusion lock that can be used to ensure only one thread can 
 */
export class Mutex {

    /**
     * 
     */
    public readonly key: string

    private id: string | undefined

    /**
     * 
     */
    public get waiting(): Promise<number> {
        return Mutex.waiting(this.key)
    }

    private _locked: boolean
    /**
     * 
     */
    public get locked(): boolean {
        return this._locked
    }

    constructor(key: string) {
        this.key = key
        this._locked = false
    }

    /**
     * 
     * @param key 
     * @param timeout 
     * @returns 
     */
    public static async exists(key: string, timeout: number = 100): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-coordinator`).unref()
            // @ts-expect-error
            bc.onmessage = (ev: MessageEvent<BunThreadsMessage>) => {
                if (ev.data.action === 'mutex_resolve_exists' && ev.data.key === key) {
                    resolve(ev.data.value)
                    bc.close()
                }
            }
            bc.postMessage({ action: 'mutex_exists', key })
            Bun.sleep(timeout).then(() => {
                reject(new TimeoutError(`Mutex.exists('${key}') timed out after ${timeout} ms. Is a Coordinator class running somewhere in your code?`))
                bc.close()
            })
        })
    }

    /**
     * 
     * @param key 
     * @param timeout 
     * @returns 
     */
    public static async waiting(key: string, timeout: number = 100): Promise<number> {
        return new Promise<number>((resolve, reject) => {
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-coordinator`).unref()
            // @ts-expect-error
            bc.onmessage = (ev: MessageEvent<BunThreadsMessage>) => {
                if (ev.data.action === 'mutex_resolve_waiting') {
                    resolve(ev.data.value)
                    bc.close()
                }
            }
            bc.postMessage({ action: 'mutex_waiting', key })
            Bun.sleep(timeout).then(() => {
                reject(new TimeoutError(`Mutex.waiting('${key}') timed out after ${timeout} ms. Is a Coordinator class running somewhere in your code?`))
                bc.close()
            })
        })
    }

    /**
     * 
     * @param key 
     * @param timeout 
     * @returns 
     */
    public static async lock(key: string, priority: boolean = false, timeout?: number): Promise<Mutex> {
        return new Mutex(key).lock(priority, timeout)
    }

    /**
     * 
     * @param timeout 
     * @returns 
     */
    public async lock(priority: boolean = false, timeout?: number): Promise<this> {
        return new Promise((resolve, reject) => {
            this.id = Bun.randomUUIDv7()
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-coordinator`).unref()
            // @ts-expect-error
            bc.onmessage = (ev: MessageEvent<BunThreadsMessage>) => {
                if (ev.data.action === 'mutex_resolve_lock' && ev.data.id === this.id) {
                    this._locked = true
                    resolve(this)
                    bc.close()
                }
                else if (ev.data.action === 'mutex_reject_lock' && ev.data.id === this.id) {
                    reject(new LockCancelError(`Lock request for key "${this.key}" was canceled.`))
                    bc.close()
                }
            }
            bc.postMessage({
                action: 'mutex_lock',
                id: this.id,
                key: this.key,
                priority: priority ? priority : undefined
            })
            if (typeof timeout === 'number') {
                Bun.sleep(timeout).then(() => {
                    reject(new TimeoutError(`mutex.lock() for key '${this.key}' timed out after ${timeout} ms. The mutex is either still locked or a Coordinator class is not running somewhere in your code.`))
                    bc.close()
                })
            }
        })
    }

    /**
     * 
     * @returns 
     */
    public cancel(): boolean {
        if (this.id) {
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-coordinator`).unref()
            bc.postMessage({
                action: 'mutex_cancel',
                id: this.id,
                key: this.key
            })
            bc.close()
            return true
        }
        return false
    }

    // TODO: MAKE THIS INTO A PROMISE
    /**
     * 
     * @returns 
     */
    public release(): boolean {
        if (this.locked) {
            const bc = new BroadcastChannel(`bun-threads-coordinator`).unref()
            bc.postMessage({
                action: 'mutex_release',
                key: this.key
            })
            bc.close()
            this.id = undefined
            this._locked = false
            return true
        }
        return false
    }
}

/**
 * 
 */
export class Coordinator {
    private dataKv: { [key: string]: Serializable }
    private mutexKv: { [key: string]: string[] }
    private bc: BroadcastChannel

    constructor() {
        this.dataKv = {}
        this.mutexKv = {}
        this.bc = new BroadcastChannel(`bun-threads-coordinator`).unref()

        // @ts-expect-error
        this.bc.onmessage = async (ev: MessageEvent<BunThreadsMessage>) => {
            switch (ev.data.action) {
                case "data_get":
                    this.bc.postMessage({
                        action: 'data_resolve_get',
                        id: ev.data.id,
                        value: this.dataKv[ev.data.key]
                    })
                    break;
                case "data_set":
                    this.dataKv[ev.data.key] = ev.data.value
                    this.bc.postMessage({
                        action: 'data_resolve_set',
                        id: ev.data.id
                    })
                    break;
                case "mutex_exists":
                    this.bc.postMessage({
                        action: 'mutex_resolve_exists',
                        key: ev.data.key,
                        value: typeof this.mutexKv[ev.data.key] !== 'undefined'
                    })
                    break;
                case "mutex_lock":
                    this.mutexKv[ev.data.key] ??= [] // create empty array for key if undefined
                    if (this.mutexKv[ev.data.key]!.length === 0) { // if the queue is empty, resolve lock immediately
                        this.bc.postMessage({
                            action: 'mutex_resolve_lock',
                            id: ev.data.id
                        })
                    }
                    if (ev.data.priority) {
                        this.mutexKv[ev.data.key]!.splice(1, 0, ev.data.id) // push to front of queue if priority, index 0 is the current lock holder
                    }
                    else {
                        this.mutexKv[ev.data.key]!.push(ev.data.id) // otherwise push to the end of the queue
                    }
                    break;
                case "mutex_release":
                    if (typeof this.mutexKv[ev.data.key] !== 'undefined') {
                        this.mutexKv[ev.data.key]!.shift()
                        if (this.mutexKv[ev.data.key]![0]) { // if there's still waiters, resolve the first in line's lock
                            this.bc.postMessage({
                                action: 'mutex_resolve_lock',
                                id: this.mutexKv[ev.data.key]![0]
                            })
                        }
                    }
                    break;
                case "mutex_waiting":
                    this.bc.postMessage({
                        action: 'mutex_resolve_waiting',
                        value: this.mutexKv[ev.data.key]?.length ?? 0
                    })
                    break;
                case "mutex_cancel":
                    if (typeof this.mutexKv[ev.data.key] !== 'undefined') {
                        this.mutexKv[ev.data.key]!.splice(this.mutexKv[ev.data.key]!.indexOf(ev.data.id), 1)
                        this.bc.postMessage({
                            action: 'mutex_reject_lock',
                            id: ev.data.id
                        })
                    }
                    break;
            }
        }
    }

    /**
     * 
     */
    public shutdown(): void {
        this.bc.close()
        this.dataKv = {}
        this.mutexKv = {}
    }

}