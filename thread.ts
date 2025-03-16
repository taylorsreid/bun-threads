export interface ThreadOptions {
    autoStop?: boolean
}

export class Thread<T> {
    private fn: (...args: any) => T
    private autoStop: boolean
    private worker: Worker | undefined
    private _stopped: boolean
    public get stopped(): boolean {
        return this._stopped
    }
    private set stopped(value: boolean) {
        this._stopped = value
    }
    private _busy: boolean
    public get busy(): boolean {
        return this._busy
    }
    private set busy(value: boolean) {
        this._busy = value
    }

    // public get idle(): Promise<this> {

    // }

    constructor(fn: (...args: any) => T, options?: ThreadOptions) {
        this.fn = fn
        options ??= {}
        options.autoStop ??= false
        this.autoStop = options.autoStop
        this._stopped = true
        this._busy = false
    }

    public start(): number {
        if (typeof this.worker === 'undefined') {
            this.worker = new Worker('./worker.ts')
            this.stopped = false
        }
        return this.worker.threadId
    }

    public async run(...args: any): Promise<T> {

        if (typeof this.worker === 'undefined') {
            this.start()
        }

        this.busy = true

        this.worker!.postMessage({
            fn: this.fn.toString(),
            args: args
        })

        return new Promise<T>((resolve, reject) => {
            // @ts-expect-error
            this.worker!.onmessage = async (event: MessageEvent) => {
                resolve(event.data)
                if (this.autoStop) {
                    await this.stop()
                }
                this.busy = false
            }
            // @ts-expect-error
            this.worker!.onerror = async (event: MessageEvent) => {
                reject(event.data)
                if (this.autoStop) {
                    await this.stop()
                }
                this.busy = false
            }
        })
    }

    public async stop(): Promise<number> {
        if (typeof this.worker !== 'undefined') {
            this.stopped = true
            const status = await this.worker.terminate()
            this.worker = undefined
            return status
        }
        return Promise.resolve(0)
    }

}