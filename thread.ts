export class Thread<T> {

    public fn: (...args: any) => T

    constructor(fn: (...args: any) => T) {
        this.fn = fn
    }

    public async run(...args: any): Promise<T> {
        const worker: Worker = new Worker('./worker.ts')
        worker.postMessage({
            fn: this.fn.toString(),
            args: args
        })
        return new Promise<T>((resolve, reject) => {
            // @ts-expect-error
            worker.onmessage = (event: MessageEvent) => {
                resolve(event.data)
            }
            // @ts-expect-error
            worker.onerror = (event: MessageEvent) => {
                reject(event.data)
            }
        })
    }
}