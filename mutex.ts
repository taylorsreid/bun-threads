// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { BroadcastChannel } from "worker_threads";

type ClientMessage = {
    action: 'lock',
    id: string,
    key: string
} | {
    action: 'cancel',
    id: string,
    key: string
} | {
    action: 'release',
    key: string
} | {
    action: 'exists',
    key: string
} | {
    action: 'waiting',
    key: string
}

type ServerMessage = {
    action: 'resolve_lock',
    id: string
} | {
    action: 'resolve_exists',
    key: string,
    value: boolean
} |  {
    action: 'resolve_waiting',
    value: number
} | {
    action: 'reject_lock'
    id: string
}

export class Mutex {
    public readonly key: string
    private id: string | undefined

    public get waiting(): Promise<number> {
        return Mutex.waiting(this.key)
    }

    private _locked: boolean
    public get locked(): boolean {
        return this._locked
    }

    constructor(key: string) {
        this.key = key
        this._locked = false
    }

    public static async exists(key: string, timeout: number = 2_000): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-mutex`).unref()
            // @ts-expect-error
            bc.onmessage = (rawMessage: MessageEvent) => {
                const message: ServerMessage | ClientMessage = rawMessage.data
                if (message.action === 'resolve_exists' && message.key === key) {
                    resolve(message.value)
                    bc.close()
                }
            }
            bc.postMessage({ action: 'exists', key })
            Bun.sleep(timeout).then(() => reject(new Error(`Timed out while waiting for exists: ${key}`)))
        })
    }

    public static async waiting(key: string): Promise<number> {
        return new Promise<number>((resolve) => {
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-mutex`).unref()
            // @ts-expect-error
            bc.onmessage = (rawMessage: MessageEvent) => {
                const message: ServerMessage | ClientMessage = rawMessage.data
                if (message.action === 'resolve_waiting') {
                    resolve(message.value)
                    bc.close()
                }
            }
            bc.postMessage({ action: 'waiting', key })
        })
    }

    public static async lock(key: string, timeout?: number): Promise<Mutex> {
        return new Mutex(key).lock(timeout)
    }

    public async lock(timeout?: number): Promise<this> {
        return new Promise((resolve, reject) => {
            this.id = Bun.randomUUIDv7()
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-mutex`).unref()
            // @ts-expect-error
            bc.onmessage = (rawMessage: MessageEvent) => {
                const message: ServerMessage | ClientMessage = rawMessage.data
                if (message.action === 'resolve_lock' && message.id === this.id) {
                    this._locked = true
                    resolve(this)
                    bc.close()
                }
                else if (message.action === 'reject_lock' && message.id === this.id) {
                    reject(new Error(`Lock request for key "${this.key}" was cancelled.`))
                    bc.close()
                }
            }
            bc.postMessage({ action: 'lock', id: this.id, key: this.key})
            if (typeof timeout === 'number') {
                Bun.sleep(timeout).then(() => reject(new Error(`Timed out while waiting for lock for key "${this.key}" after ${timeout} milliseconds.`)))
            }
        })
    }

    public cancel(): boolean {
        if (this.id) {
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-mutex`).unref()
            bc.postMessage({
                action: 'cancel',
                id: this.id,
                key: this.key
            })
            return true
        }
        return false
    }

    public release(): boolean {
        if (this.locked) {
            const bc = new BroadcastChannel(`bun-threads-mutex`).unref()
            bc.postMessage({
                action: 'release',
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

const kv: { [key: string]: string[] } = {}
const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-mutex`).unref()

// @ts-expect-error
bc.onmessage = async (rawMessage: MessageEvent) => {
    const message: ClientMessage = rawMessage.data
    switch (message.action) {
        case "exists":
            bc.postMessage({
                action: 'resolve_exists',
                key: message.key,
                value: typeof kv[message.key] !== 'undefined'
            })
            break;
        case "lock":
            kv[message.key] ??= []
            if (kv[message.key]!.length === 0) { // if the queue is empty, resolve lock immediately
                bc.postMessage({
                    action: 'resolve_lock',
                    id: message.id
                })
            }
            kv[message.key]!.push(message.id) // push to queue either way
            break;
        case "release":
            if (typeof kv[message.key] !== 'undefined') {
                kv[message.key]!.shift()
                if (kv[message.key]![0]) { // if there's still waiters, resolve the first in line's lock
                    bc.postMessage({
                        action: 'resolve_lock',
                        id: kv[message.key]![0]
                    })
                }
            }
            break;
        case "waiting":
            bc.postMessage({
                action: 'resolve_waiting',
                value: kv[message.key]?.length ?? 0
            })
            break;
        case "cancel":
            if (typeof kv[message.key] !== 'undefined') {
                kv[message.key]!.splice(kv[message.key]!.indexOf(message.id), 1)
                bc.postMessage({
                    action: 'reject_lock',
                    id: message.id
                })
            }
            break;
    }
}