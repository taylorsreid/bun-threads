// type Primitive = null | undefined | boolean | number | bigint | string | symbol
export type Serializable = null | undefined | boolean | number | bigint | string |
Array<Serializable> | ArrayBuffer | Boolean | DataView | Date | Error | Map<Serializable, Serializable> | Number | Object | RegExp | Set<Serializable> | String |
Int8Array | Uint8Array | Uint8ClampedArray | Int16Array | Uint16Array | Int32Array | Uint32Array | Float16Array | Float32Array | Float64Array | BigInt64Array | BigUint64Array

export class Thread<T> {

    public fn: (...args: any) => T

    private worker: Worker

    private closed: boolean

    private _busy: boolean
    public get busy(): boolean {
        return this._busy
    }
    private set busy(value: boolean) {
        this._busy = value
    }

    constructor(fn: (...args: any) => T) {
        this.fn = fn
        this.worker = new Worker('./worker.ts')
        this.closed = false
        this._busy = false
    }

    public async run(...args: any): Promise<T> {

        if (this.closed) {
            throw new Error(`run() called on closed thread for function ${this.fn.toString()}`)
        }

        this.busy = true
        this.worker.postMessage({
            fn: this.fn.toString(),
            args: args
        })
        return new Promise<T>((resolve, reject) => {
            // @ts-expect-error
            this.worker.onmessage = (event: MessageEvent) => {
                resolve(event.data)
                this.busy = false
            }
            // @ts-expect-error
            this.worker.onerror = (event: MessageEvent) => {
                reject(event.data)
                this.busy = false
            }
        })
    }

    public async close(): Promise<number> {
        if (!this.closed) {
            this.closed = true
            return this.worker.terminate()
        }
        return Promise.resolve(0)
    }

}