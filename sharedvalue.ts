// Copyright 2025 Taylor Reid
// Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the “Software”), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:
// The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.
// THE SOFTWARE IS PROVIDED “AS IS”, WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.

import { BroadcastChannel } from "worker_threads";
import { AsyncFunction, getFunctionArgumentNames, getFunctionBody } from "./util";

type ClientMessage = {
    action: 'get',
    id: string,
    key: string,
    property: never,
    lock: boolean
    args: never
} | {
    action: 'get',
    id: string,
    key: string,
    property: string,
    lock: never
    args?: any[]
} | {
    action: 'set',
    id: string,
    key: string,
    property?: string,
    value: any,
    cloneable: true,
    args: never
} | {
    action: 'set',
    id: string,
    key: string,
    property?: string,
    value: string,
    cloneable: false,
    args: never
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
    action: 'resolve_get',
    id: string,
    value: any,
    waiting: number,
    cloneable: true
} | {
    action: 'resolve_get',
    id: string,
    value: { [key: string]: 'bigint' | 'boolean' | 'function' | 'number' | 'object' | 'string' | 'symbol' | 'undefined' },
    waiting: number,
    cloneable: false
} | {
    action: 'resolve_exists',
    value: boolean
} | {
    action: 'resolve_set'
    id: string
} | {
    action: 'resolve_waiting',
    value: number
} | {
    action: 'reject'
    id: string
    value: string
}

type RemoteObject<T> = {
    [K in keyof T]: T[K] extends (...args: any) => any ? () => Promise<ReturnType<T[K]>> : Promise<T[K]>
}

type ClassConstructor<T> = {
    new(...args: any[]): T;
}

type AnyExceptFunction<T> = Exclude<T, (args: any[]) => any>

export class SharedValue<T = any> {
    public readonly key: string

    public value: T

    public get waiting(): Promise<number> {
        return new Promise<number>((resolve) => {
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-sync`)
            // @ts-expect-error
            bc.onmessage = (rawMessage: MessageEvent) => {
                const message: ServerMessage | ClientMessage = rawMessage.data
                if (message.action === 'resolve_waiting') {
                    resolve(message.value)
                    bc.close()
                }
            }
            bc.postMessage({
                action: 'waiting',
                key: this.key
            })
        })
    }

    private _locked: boolean
    public get locked(): boolean {
        return this._locked
    }

    private args?: any[]

    private constructor(key: string, value: T, locked: boolean, args?: any[]) {
        this.key = key
        this.value = value
        // this.waiting = waiting
        this._locked = locked
        this.args = args
    }
    
    public static async new<T>(key: string, value: AnyExceptFunction<T>): Promise<SharedValue<T>>
    public static async new<T extends (args: any[]) => any>(key: string, value: T, ...args: Parameters<T>): Promise<SharedValue<RemoteObject<Awaited<ReturnType<T>>>>>
    public static async new<T>(key: string, value: T, ...args: any[]) {
        if (await SharedValue.exists(key)) {
            throw new Error(`A SharedValue for key "${key}" already exists. Use a different unique key or use SharedValue.get() to modify the existing value.`)
        }
        await new SharedValue(key, value, true, args).save()
        return SharedValue.get(key) // need to call get() to obtain the lock
    }

    // TODO: make exists a separate message type from get to reduce serialization overhead
    public static async exists(key: string): Promise<boolean> {
        return new Promise<boolean>((resolve, reject) => {
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-sync`)
            // @ts-expect-error
            bc.onmessage = (rawMessage: MessageEvent) => {
                const message: ServerMessage | ClientMessage = rawMessage.data
                if (message.action === 'resolve_exists') {
                    resolve(message.value)
                    bc.close()
                }
            }
            bc.postMessage({ action: 'exists', key })
            Bun.sleep(2000).then(() => reject(`Timed out while waiting for EXISTS: ${key}`))
        })
    }

    public static async get<T = any>(key: string, lock?: boolean): Promise<SharedValue<T>>
    public static async get<T = any>(key: string, expected: ClassConstructor<T>, lock?: boolean): Promise<SharedValue<RemoteObject<T>>>
    public static async get<T = any>(key: string, lockOrExpected?: boolean | ClassConstructor<T>, lock: boolean = true): Promise<SharedValue<T | RemoteObject<T>>> {
        return new Promise((resolve, reject) => {
            const id: string = Bun.randomUUIDv7()
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-sync`)
            // @ts-expect-error
            bc.onmessage = (rawMessage: MessageEvent) => {
                const message: ServerMessage | ClientMessage = rawMessage.data
                if (message.action === 'resolve_get' && message.id === id) {
                    if (message.cloneable) {
                        resolve(new SharedValue(key, message.value, lock))
                    }
                    else {
                        const remoteObject: RemoteObject<T> = {} as RemoteObject<T> // do it anyways
                        for (const [property, value] of Object.entries(message.value)) {
                            if (value === 'function') {
                                Object.defineProperty(remoteObject, property, {
                                    value: (...args: any[]) => new Promise((resolve2, reject2) => {
                                        const id2: string = Bun.randomUUIDv7()
                                        const bc2: BroadcastChannel = new BroadcastChannel(`bun-threads-sync`)
                                        // @ts-expect-error
                                        bc2.onmessage = (rawMessage2: MessageEvent) => {
                                            const message2: ServerMessage | ClientMessage = rawMessage2.data
                                            if (message2.action === 'resolve_get' && message2.id === id2) {
                                                bc2.close()
                                                resolve2(message2.value)
                                            }
                                        }
                                        bc2.postMessage({ action: 'get', id: id2, key, property, args })
                                        Bun.sleep(2000).then(() => {
                                            bc2.close()
                                            reject2(`Timed out while waiting for GET: ${key}.${property}()`)
                                        })
                                    })
                                })
                            }
                            else { // anything but function
                                Object.defineProperty(remoteObject, property, {
                                    get: () => new Promise((resolve2, reject2) => {
                                        const id2: string = Bun.randomUUIDv7()
                                        const bc2: BroadcastChannel = new BroadcastChannel(`bun-threads-sync`)
                                        // @ts-expect-error
                                        bc2.onmessage = (rawMessage2: MessageEvent) => {
                                            const message2: ServerMessage | ClientMessage = rawMessage2.data
                                            if (message2.action === 'resolve_get' && message2.id === id2) {
                                                bc2.close()
                                                resolve2(message2.value)
                                            }
                                        }
                                        bc2.postMessage({ action: 'get', id: id2, key, property })
                                        Bun.sleep(2000).then(() => reject2(`Timed out while waiting for GET: ${key}.${property}`))
                                    }),
                                    set(value) {
                                        const id2: string = Bun.randomUUIDv7()
                                        const bc2: BroadcastChannel = new BroadcastChannel(`bun-threads-sync`)
                                        bc2.postMessage({ action: 'set', id: id2, key, property, value, cloneable: false })
                                        bc2.close()
                                    },
                                })
                            }
                        }
                        resolve(new SharedValue(key, remoteObject, lock))
                    }
                }
                else if (message.action === 'reject' && message.id === id) {
                    reject(new Error(message.value))
                }
                bc.close()
            }
            if (typeof lockOrExpected === 'boolean') {
                bc.postMessage({ action: 'get', id, key, lockOrExpected })
            }
            else {
                bc.postMessage({ action: 'get', id, key, lock })
            }
        })
    }

    public async save(): Promise<void> {
        return new Promise((resolve) => {
            const id: string = Bun.randomUUIDv7()
            const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-sync`)
            // @ts-expect-error
            bc.onmessage = (rawMessage: MessageEvent) => {
                const message: ServerMessage | ClientMessage = rawMessage.data
                if (message.action === 'resolve_set' && message.id === id) {
                    bc.close()
                    resolve()
                }
            }
            bc.postMessage({
                action: 'set',
                key: this.key,
                id,
                value: typeof this.value === 'function' ? this.value.toString() : this.value,
                cloneable: typeof this.value !== 'function',
                args: this.args
            })
        })
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
            queue: string[],
            cloneable: boolean
        }
    }

    private bc: BroadcastChannel

    private getTransferable(key: string): any {
        if (this.kv[key]?.cloneable) {
            return this.kv[key].value
        }
        else {
            let shell: { [key: string]: any } = {}
            Object.keys(this.kv[key]?.value).map(value => shell[value] = typeof this.kv[key]?.value[value])
            Object.getOwnPropertyNames(Object.getPrototypeOf(this.kv[key]?.value)).map(value => {
                if (value !== 'constructor') {
                    shell[value] = typeof this.kv[key]?.value[value]
                }
            })
            return shell
        }
    }

    constructor() {
        this.kv = {}
        this.bc = new BroadcastChannel(`bun-threads-sync`)
        // @ts-expect-error
        this.bc.onmessage = async (rawMessage: MessageEvent) => {
            const message: ClientMessage = rawMessage.data
            switch (message.action) {
                case "exists":
                    this.bc.postMessage({
                        action: 'resolve_exists',
                        value: typeof this.kv[message.key] !== 'undefined'
                    })
                    break;
                case "get":
                    if (typeof this.kv[message.key] !== 'undefined') { // if exists
                        if (typeof message.property === 'undefined') { // they're trying to retrieve the entire value
                            if (this.kv[message.key]!.queue.length === 0 || !message.lock) { // if the queue is empty or they're not requesting exclusive access
                                this.bc.postMessage({
                                    action: 'resolve_get',
                                    id: message.id,
                                    value: this.getTransferable(message.key),
                                    waiting: this.kv[message.key]!.queue.length,
                                    cloneable: this.kv[message.key]!.cloneable
                                })
                            }
                            if (message.lock) { // else wait for release
                                this.kv[message.key]!.queue.push(message.id)
                            }
                        }
                        else if (typeof message.args === 'undefined') { // they're trying to retrieve a property
                            this.bc.postMessage({
                                action: 'resolve_get',
                                id: message.id,
                                value: this.kv[message.key]!.value[message.property],
                                waiting: 0, // not applicable but included for completeness
                                cloneable: this.kv[message.key]!.cloneable // they shouldn't be trying to 'get' a function anyways, because they would just be getting the proxy method if they tried
                            })
                        }
                        else { // they're calling a function
                            try {
                                this.bc.postMessage({
                                    action: 'resolve_get',
                                    id: message.id,
                                    value: (this.kv[message.key]!.value[message.property] as Function).apply(this.kv[message.key]!.value, message.args),
                                    waiting: 0, // not applicable but included for completeness
                                    cloneable: this.kv[message.key]!.cloneable // not applicable but included for completeness
                                })
                            }
                            catch (error) {
                                this.bc.postMessage({
                                    action: 'reject',
                                    id: message.id,
                                    value: (error as Error).message
                                })
                            }
                        }
                    }
                    else {
                        this.bc.postMessage({
                            action: 'reject',
                            id: message.id,
                            value: `No value found for key "${message.key}".`
                        })
                    }
                    break;
                case "release":
                    if (typeof this.kv[message.key] !== 'undefined') {
                        this.kv[message.key]!.queue.shift()
                        if (this.kv[message.key]!.queue[0]) {
                            this.bc.postMessage({
                                action: 'resolve_get',
                                id: this.kv[message.key]!.queue[0],
                                value: this.getTransferable(message.key),
                                waiting: this.kv[message.key]!.queue.length,
                                cloneable: this.kv[message.key]!.cloneable
                            })
                        }
                    }
                    break;
                case "set":
                    // TODO: ADD BETTER ERROR HANDLING AND MORE HELPFUL MESSAGES LIKE IN worker.ts
                    // why not use another switch statement? here's why: https://stackoverflow.com/questions/40999025/javascript-scope-variable-to-switch-case
                    if (typeof message.property === 'undefined') { // they're trying to set the entire value
                        try {
                            if (message.cloneable) {
                                if (typeof this.kv[message.key] !== 'undefined') {
                                    this.kv[message.key]!.value = message.value
                                    this.kv[message.key]!.cloneable = message.cloneable
                                }
                                else {
                                    this.kv[message.key] = {
                                        value: message.value,
                                        queue: [],
                                        cloneable: message.cloneable
                                    }
                                }
                            }
                            else {
                                const fnArgNames: string[] = getFunctionArgumentNames(message.value)
                                const fnBody: string = getFunctionBody(message.value)
                                const retValue = message.value.startsWith('async') ? await AsyncFunction(...fnArgNames, fnBody).apply(undefined, message.args) : Function(...fnArgNames, fnBody).apply(undefined, message.args)
                                if (typeof this.kv[message.key] !== 'undefined') {
                                    this.kv[message.key]!.value = retValue
                                    this.kv[message.key]!.cloneable = message.cloneable
                                }
                                else {
                                    this.kv[message.key] = {
                                        value: retValue,
                                        queue: [],
                                        cloneable: message.cloneable
                                    }
                                }
                            }
                            this.bc.postMessage({
                                action: 'resolve_set',
                                id: message.id
                            })
                        }
                        catch (error) {
                            this.bc.postMessage({
                                action: 'reject',
                                id: message.id,
                                value: (error as Error).message
                            })
                        }
                    }
                    else { // they're trying to set a property of the value
                        if (typeof this.kv[message.key] !== 'undefined') {
                            this.kv[message.key]!.value[message.property] = message.value
                        }
                        // else isn't possible because property setters can't have return values
                    }
                    break;
                case "waiting":                    
                    this.bc.postMessage({
                        action: 'resolve_waiting',
                        value: this.kv[message.key]!.queue.length > 0 ? this.kv[message.key]!.queue.length - 1 : 0
                    })
                    break;
            }
        }
    }

    public shutdown(): void {
        this.bc.close()
    }

}