// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { BroadcastChannel } from "worker_threads";

type ClientMessage = {
    action: 'get',
    id: string,
    key: string,
    lock: boolean
} | {
    action: 'set',
    key: string,
    value: any
} | {
    action: 'release',
    key: string
}

type ServerMessage = {
    action: 'resolve',
    id: string,
    value: any,
    waiting: number
} | {
    action: 'reject',
    id: string,
    reason: string
}

export class SharedValue<T = any> {
    public readonly key: string

    public value: T

    public readonly waiting: number

    private _locked: boolean
    public get locked(): boolean {
        return this._locked
    }

    private constructor(key: string, value: T, waiting: number, locked: boolean) {
        this.key = key
        this.value = value
        this.waiting = waiting
        this._locked = locked
    }

    public static async new<T>(key: string, value: T): Promise<SharedValue<T>> {
        if (await SharedValue.exists(key)) {
            throw new Error(`A SharedValue for key "${key}" already exists. Use a different unique key or use SharedValue.get() to modify the existing value.`)
        }
        new SharedValue(key, value, 0, true).save()
        return SharedValue.get(key) // need to call get() to obtain the lock
    }

    public static async exists(key: string): Promise<boolean> {
        try {
            await SharedValue.get(key, false)
            return true
        }
        catch (error) {
            return false
        }
    }

    public static async get<T = any>(key: string, lock: boolean = true): Promise<SharedValue<T>> {
        return new Promise((resolve, reject) => {
            const id: string = Bun.randomUUIDv7()
            const bc = new BroadcastChannel(`bun-threads-sync`)
            // @ts-expect-error
            bc.onmessage = (rawMessage: MessageEvent) => {
                const message: ServerMessage | ClientMessage = rawMessage.data
                if (message.action === 'resolve' && message.id === id) {
                    resolve(new SharedValue(key, message.value, message.waiting, lock))
                    bc.close()
                }
                else if (message.action === 'reject' && message.id === id) {
                    reject(new Error(message.reason))
                    bc.close()
                }
            }
            bc.postMessage({ action: 'get', id, key, lock })
        })
    }

    public save(): this {
        const bc = new BroadcastChannel(`bun-threads-sync`)
        bc.postMessage({
            action: 'set',
            key: this.key,
            value: this.value
        })
        bc.close()
        return this
    }

    public release(): boolean {
        if (this.locked) {
            const bc = new BroadcastChannel(`bun-threads-sync`)
            bc.postMessage({
                action: 'release',
                key: this.key
            })
            bc.close()
            this._locked = false
            return true
        }
        return false
    }

}

export class SharedValueServer {
    private kv: {
        [key: string]: {
            value: any,
            queue: string[]
        }
    }

    private bc: BroadcastChannel

    constructor() {
        this.kv = {}
        this.bc = new BroadcastChannel('bun-threads-sync')
        // @ts-expect-error
        this.bc.onmessage = (rawMessage: MessageEvent) => {
            const message: ClientMessage = rawMessage.data
            switch (message.action) {
                case "get":
                    if (typeof this.kv[message.key] !== 'undefined') {
                        if (this.kv[message.key]!.queue.length === 0 || !message.lock) {
                            this.bc.postMessage({
                                action: 'resolve',
                                id: message.id,
                                value: this.kv[message.key]!.value,
                                waiting: this.kv[message.key]!.queue.length
                            })
                        }
                        // else wait for release
                        if (message.lock) {
                            this.kv[message.key]!.queue.push(message.id)
                        }
                    }
                    else {
                        this.bc.postMessage({
                            action: 'reject',
                            id: message.id,
                            reason: `No value found for key "${message.key}".`
                        })
                    }
                    break;
                case "release":
                    if (typeof this.kv[message.key] !== 'undefined') {
                        this.kv[message.key]!.queue.shift()
                        if (this.kv[message.key]!.queue[0]) {
                            this.bc.postMessage({
                                action: 'resolve',
                                id: this.kv[message.key]!.queue[0],
                                value: this.kv[message.key]!.value,
                                waiting: this.kv[message.key]!.queue.length
                            })
                        }
                    }
                    break;
                case "set":
                    if (typeof this.kv[message.key] !== 'undefined') {
                        this.kv[message.key]!.value = message.value
                    }
                    else {
                        this.kv[message.key] = {
                            value: message.value,
                            queue: []
                        }
                    }
            }
        }
    }

    public shutdown(): void {
        this.bc.close()
    }

}