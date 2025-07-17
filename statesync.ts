import { BroadcastChannel } from "worker_threads";
import type { StructuredClonable } from "./util";
import { Mutex } from "async-mutex";

interface SharedValueBaseMessage {
    action: 'init' | 'get' | 'is' | 'set' | 'lock' // | 'mutate' | 'delete' | 'lock' | 'unlock'
}

interface SharedValueInitMessage extends SharedValueBaseMessage {
    action: 'set'
    id: string
}

interface SharedValueGetMessage extends SharedValueBaseMessage {
    action: 'get'
}

interface SharedValueIsMessage extends SharedValueBaseMessage {
    action: 'is',
    value: StructuredClonable,
    lockerId: string
    locked: boolean
}

interface SharedValueSetMessage extends SharedValueBaseMessage {
    action: 'set',
    value: StructuredClonable
}

interface SharedValueLockMessage extends SharedValueBaseMessage {
    action: 'lock',
    lockerId: string
}

type SharedValueMessage = SharedValueInitMessage | SharedValueGetMessage | SharedValueIsMessage | SharedValueSetMessage | SharedValueLockMessage

export class SharedValue<T extends StructuredClonable> {
    public readonly key: string
    public value: T
    private id: string
    private listeners: Set<string>
    private mutex: Mutex
    private lockerId: string | undefined
    private channel: BroadcastChannel

    constructor(key: string, value: T) {
        this.key = key
        this.value = value
        this.id = Bun.randomUUIDv7()
        this.listeners = new Set<string>()
        this.mutex = new Mutex()
        this.channel = new BroadcastChannel(`bun-threads-sync:${key}`)
        this.channel.postMessage({
            action: 'init',
            id: this.id
        })
        this.channel.onmessage = (message: unknown) => {
            const knownMessage: SharedValueMessage = message as SharedValueMessage
            switch (knownMessage.action) {
                // TODO:
            }
        }
    }

    public static async exists(key: string, timeoutMs: number = 5_000): Promise<boolean> {
        return Promise.race([
            SharedValue.get(key, false).then(() => true),
            Bun.sleep(timeoutMs).then(() => false)
        ])
    }

    public static async get(key: string, lock: boolean = true): Promise<SharedValue<any>> {
        return new Promise((resolve) => {
            const channel: BroadcastChannel = new BroadcastChannel(`bun-threads-sync:${key}`)
            channel.onmessage = async (message: unknown) => {
                if (lock && (message as SharedValueMessage).action === 'is' && !(message as SharedValueIsMessage).locked) {
                    const ts = new SharedValue(key, (message as SharedValueIsMessage).value)
                    await ts.lock()
                    resolve(ts)
                    channel.close()
                }
                else if (!lock) {
                    const ts = new SharedValue(key, (message as SharedValueIsMessage).value)
                    resolve(ts)
                    channel.close()
                }
            }
            channel.postMessage({ action: 'get' })
        })
    }

    public save(): void {
        this.channel.postMessage({
            action: 'set',
            value: this.value
        })
    }

    public async lock(): Promise<void> {
        await this.mutex.acquire()
        const message: SharedValueLockMessage = {
            action: 'lock',
            lockerId: this.id
        }
        this.lockerId = this.id
        this.channel.postMessage(message)
    }

    public unlock(): boolean {
        const isOwner: boolean = this.lockerId === this.id
        if (isOwner) {
            this.mutex.release()
        }
        return isOwner
    }
}

// import { Mutex } from 'async-mutex';
// import type { StructuredClonable } from './util';

// export class $This {
    // [key: string | symbol]: {
    //     isClonable: true
    //     mutex: Mutex
    //     lockId: string
    //     data: {
    //         value: StructuredClonable
    //     }        
    // } | {
    //     isClonable: false
    //     mutex: Mutex
    //     lockId: string
    //     data: {
    //         value: any
    //         fn: string
    //         args: any[]
    //     }
//     }

//     private static handler: ProxyHandler<$This> = {
//         get(target, prop): any {
//             return target[prop]?.data.value
//             // TODO: mutex lock
//         },
//         set(target, prop, value): boolean {
//             if (typeof target[prop] !== 'undefined') {
//                 target[prop].data = value;  
//             }
//             else {
//                 target[prop] = {

//                 }
//             }
//             return true;
//         }
//     }

//     constructor() {
//         return new Proxy(this, $This.handler)
//     }
// }

// interface SetRequest extends BaseRequest {
//     action: 'set'
//     value: any
// }

// // interface MutateRequest extends BaseRequest {
// //     action: 'mutate'
// //     value: [string, ...any] // stringified function and arguments
// // }

// interface DeleteRequest extends BaseRequest {
//     action: 'delete'
// }

// interface LockRequest extends BaseRequest {
//     action: 'lock'
// }

// interface UnlockRequest extends BaseRequest {
//     action: 'unlock'
// }

// type StateSyncRequest = GetRequest | InitRequest | SetRequest | DeleteRequest | LockRequest | UnlockRequest // | MutateRequest



// export class StateSyncClient {
//     private kv: StateSyncKeyValueStore
//     public mutexTimeout: number
//     private client!: BroadcastChannel | udp.ConnectedSocket<"buffer"> | WebSocket // | Server // TODO: create separate server class
//     private initPromises: Promise<any>[]

//     constructor(opts: {
//         protocol: 'bc',
//         channelName: string
//     } | {
//         protocol: 'udp',
//         host: string,
//         port: number,
//         // unix?: boolean // TODO: does this work yet?
//     } | {
//         protocol: 'ws',
//         host: string,
//         port: number
//     }) {
//         this.kv = {}
//         this.mutexTimeout = 5000
//         this.initPromises = []

//         if (opts.protocol === 'bc') {
//             this.client = new BroadcastChannel(opts.channelName)
//             // @ts-expect-error
//             this.client.onmessage = (me: MessageEvent) => this.handler(me.data)
//         }
//         else if (opts.protocol === 'udp') {
//             this.initPromises.push(Bun.udpSocket({
//                 connect: {
//                     port: opts.port,
//                     hostname: opts.host,
//                 },
//                 socket: {
//                     data: (_socket, buf, _port, _addr) => this.handler(JSON.parse(buf.toString()))
//                 },
//             }).then((socket) => {
//                 // @ts-expect-error
//                 socket.setBroadcast(true) // upstream error in Bun, method exists but doesn't have a type declaration
//                 this.client = socket
//             }))
//         }
//         else if (opts.protocol === 'ws') {
//             if (!opts.host.startsWith('ws://') || !opts.host.startsWith('wss://')) {
//                 opts.host = 'ws://' + opts.host
//             }
//             this.client = new WebSocket(opts.host + ':' + opts.port);
//         }
//         else {
//             throw new Error('unreachable code reached')
//         }
//     }

//     private async handler(request: StateSyncRequest) {
//         await Promise.all(this.initPromises)
//         // if (this.client instanceof BroadcastChannel || 'sendMany' in this.client) {
//         if (request.action === 'lock') {
//             this.kv[request.key]?.mutex.acquire()
//         }
//         else if (request.action === 'unlock') {
//             this.kv[request.key]?.mutex.release()
//         }
//         else if (request.action === 'set') {

//         }
//         // else if (request.action === 'get') {
            
//         // }
//     }

//     public async get(key: string, lock: boolean = true): Promise<[value: any | null, unlock: () => void]> {
//         await Promise.all(this.initPromises)
//         if (this.client instanceof BroadcastChannel || 'sendMany' in this.client) {
//             if (key in this.kv) {
//                 if (lock) {
//                     // lock or timeout
//                     try {
//                         await Promise.race([
//                             this.kv[key]?.mutex.acquire(),
//                             new Promise<MutexInterface.Releaser>((_, reject) => {
//                                 setTimeout(() => {
//                                     reject(new Error(`Failed to acquire mutex lock for key "${key}" within ${this.mutexTimeout} milliseconds.`))
//                                 }, this.mutexTimeout);
//                             })
//                         ])
//                     } catch (error) {
//                         return Promise.reject(error)
//                     }

//                     // generate ids and messages
//                     const id: string = Bun.randomUUIDv7()
//                     const lockRequest: LockRequest = { action: 'lock', id, key }
//                     const unlockRequest: UnlockRequest = { action: 'unlock', id, key }

//                     // 
//                     if (this.client instanceof BroadcastChannel) {
//                         this.client.postMessage(lockRequest)
//                         return [this.kv[key], () => {
//                             this.kv[key]?.mutex.release();
//                             (this.client as BroadcastChannel).postMessage(unlockRequest)
//                         }]
//                     }

//                     // it's udp then
//                     this.client.send(JSON.stringify(lockRequest))
//                     return [this.kv[key], () => {
//                         this.kv[key]?.mutex.release();
//                         (this.client as udp.ConnectedSocket<"buffer">).send(JSON.stringify(unlockRequest))
//                     }]
//                 }

//                 // if not locked, return value and dummy function
//                 return [this.kv[key], () => { }]
//             }

//             // null indicates that the key value doesn't exist, null stringifies better than undefined
//             return [null, () => { }]
//         }
//         else if (this.client instanceof WebSocket) {
//             throw new Error('Websockets are not implemented yet.')
//         }
//         else {
//             throw new Error('unreachable code reached')
//         }
//     }

//     public async set(key: string, value: any): Promise<void>
//     public async set<T>(key: string, value: (currentValue?: T) => T): Promise<void>
//     public async set<T>(key: string, valueOrSetter: any | ((currentValue?: T) => T)): Promise<void> {
        
//     }

// }

