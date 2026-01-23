// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { BroadcastChannel, type Serializable } from "worker_threads";

type BunThreadsMessage = {
    action: 'data_set',
    id: string,
    key: Serializable,
    value: Serializable
} | {
    action: 'data_get',
    id: string,
    key: Serializable
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
    action: 'mutex_resolve_release',
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
 * A mutual exclusion lock that can be used to ensure only one thread can access a shared resource at a time.
 * TODO:
 * @example
 */
export class Mutex {

    /**
     * A unique string identifier for this Mutex that can be used across threads to obtain and release the lock.
     */
    public readonly key: string

    private id: string | undefined

    /**
     * How many mutex instances are currently using/waiting on the lock. This number includes the current lock holder and the instance that called this property getter.
     */
    public get waiting(): Promise<number> {
        return Mutex.waiting(this.key)
    }

    private _locked: boolean
    /**
     * If this mutex instance is the current lock holder.
     */
    public get locked(): boolean {
        return this._locked
    }

    /**
     * Create a new mutual exclusion lock that can be used to ensure only one thread can access a shared resource at a time. The mutex will not be locked until the asynchronous .lock() method is called and resolved.
     * @param key a unique string identifier for this mutex that can be used across threads to obtain and release the lock.
     */
    constructor(key: string) {
        this.key = key
        this._locked = false
    }

    /**
     * Check whether a mutex exists in memory for a given key. This method will return true if a mutex has previously existed for this key,
     * even if no other mutex instances are currently waiting.
     * @param key the unique string identifier for the mutex.
     * @param timeout how long in milliseconds to wait on the Coordinator class to respond before the returned promise rejects. Default is 100 ms.
     * @returns a `Promise<boolean>` that resolves to whether a mutex exists or has existed for the given key.
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
     * Get the amount of mutex instances that are currently using/waiting on the lock. This number includes the current lock holder.
     * @param key the unique string identifier for the mutex.
     * @param timeout how long in milliseconds to wait on the Coordinator class to respond before the returned promise rejects. Default is 100 ms.
     * @returns a `Promise<number>` that resolves to how many mutex instances are currently using/waiting on the lock. This number includes the current lock holder.
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
     * Create a new Mutex instance and immediately call the asynchronous .lock() method. This static method is shorthand for `await new Mutex('key').lock()`.
     * @param key the unique string identifier for the mutex.
     * @param priority if true, place this request at the front of the queue to resolve next, skipping all other lock requests. Default is false.
     * @param timeout how long in milliseconds to wait for the lock to resolve before the returned promise rejects. Default is to wait indefinitely.
     * @throws TODO:
     * @returns a `Promise<Mutex>` that once resolved, can be used to call the instance .release() method.
     */
    public static async lock(key: string, priority: boolean = false, timeout?: number): Promise<Mutex> {
        return new Mutex(key).lock(priority, timeout)
    }

    /**
     * Request a mutual exclusion lock for the given key. Only one instance can hold a lock at any given time.
     * @param priority if true, place this request at the front of the queue to resolve next, skipping all other lock requests. Default is false.
     * @param timeout how long in milliseconds to wait for the lock to resolve before the returned promise rejects. Default is to wait indefinitely.
     * @throws TODO:
     * @returns a Promise that resolves when the mutual exclusion lock has been obtained. Don't forget to call release afterwards or your program will deadlock.
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
     * TODO:
     * @param timeout 
     * @returns 
     * @throws
     * @example
     */
    public async cancel(timeout: number = 100): Promise<boolean> {
        return new Promise((resolve, reject) => {
            if (this.id) {
                const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-coordinator`).unref()
                // @ts-ignore
                bc.onmessage = (ev: MessageEvent<BunThreadsMessage>) => {
                    if (ev.data.action === 'mutex_reject_lock' && ev.data.id === this.id) {
                        resolve(true)
                        this.id = undefined
                        bc.close()
                    }
                }
                bc.postMessage({
                    action: 'mutex_cancel',
                    id: this.id,
                    key: this.key
                })
                Bun.sleep(timeout).then(() => {
                    reject(new TimeoutError(`mutex.cancel() for key '${this.key}' timed out after ${timeout} ms. Is a Coordinator class running somewhere in your code?`))
                    bc.close()
                })
            }
            else {
                resolve(false)
            }
        })
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
    private dataMap: Map<Serializable, Serializable>
    private mutexMap: Map<string, string[]>
    private bc: BroadcastChannel

    constructor() {
        this.dataMap = new Map<Serializable, Serializable>()
        this.mutexMap = new Map<string, string[]>
        this.bc = new BroadcastChannel(`bun-threads-coordinator`).unref()

        // @ts-expect-error
        this.bc.onmessage = async (ev: MessageEvent<BunThreadsMessage>) => {
            switch (ev.data.action) {
                case "data_get":
                    this.bc.postMessage({
                        action: 'data_resolve_get',
                        id: ev.data.id,
                        value: this.dataMap.get(ev.data.key)
                    })
                    break;
                case "data_set":
                    this.dataMap.set(ev.data.key, ev.data.value)
                    this.bc.postMessage({
                        action: 'data_resolve_set',
                        id: ev.data.id
                    })
                    break;
                case "mutex_exists":
                    this.bc.postMessage({
                        action: 'mutex_resolve_exists',
                        key: ev.data.key,
                        value: this.mutexMap.has(ev.data.key)
                    })
                    break;
                case "mutex_lock":
                    if (!this.mutexMap.has(ev.data.key)) this.mutexMap.set(ev.data.key, [])

                    if (ev.data.priority) this.mutexMap.get(ev.data.key)!.splice(1, 0, ev.data.id)
                    else this.mutexMap.get(ev.data.key)!.push(ev.data.id)

                    if (this.mutexMap.get(ev.data.key)!.length === 1) { // if the queue was empty before the push, resolve lock immediately
                        this.bc.postMessage({
                            action: 'mutex_resolve_lock',
                            id: ev.data.id
                        })
                    }
                    break;
                case "mutex_release":
                    if (this.mutexMap.has(ev.data.key)) {
                        this.mutexMap.get(ev.data.key)!.shift()
                        if (this.mutexMap.get(ev.data.key)![0]) { // if there's still waiters, resolve the first in line's lock
                            this.bc.postMessage({
                                action: 'mutex_resolve_lock',
                                id: this.mutexMap.get(ev.data.key)![0]
                            })
                        }
                    }
                    break;
                case "mutex_waiting":
                    this.bc.postMessage({
                        action: 'mutex_resolve_waiting',
                        value: this.mutexMap.get(ev.data.key)?.length ?? 0
                    })
                    break;
                case "mutex_cancel":
                    if (this.mutexMap.has(ev.data.key)) {
                        this.mutexMap.get(ev.data.key)!.splice(this.mutexMap.get(ev.data.key)!.indexOf(ev.data.id), 1)
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
        this.dataMap.clear()
        this.mutexMap.clear()
    }

}