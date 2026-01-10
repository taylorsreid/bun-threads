import { BroadcastChannel, type Serializable } from "worker_threads";

export async function getEnvironmentData(key: string): Promise<Serializable> {
    return new Promise((resolve) => {
        const id: string = Bun.randomUUIDv7()
        const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-environment-data`).unref()
        // @ts-ignore
        bc.onmessage = (rawMessage: MessageEvent) => {
            const data: { id: string, value: Serializable } = rawMessage.data
            if (data.id === id) {
                resolve(data.value)
                bc.close()
            }
        }
        bc.postMessage({ id, key })
    })
}

export async function setEnvironmentData(key: string, value: Serializable): Promise<void> {
    return new Promise((resolve) => {
        const id: string = Bun.randomUUIDv7()
        const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-environment-data`).unref()
        // @ts-ignore
        bc.onmessage = (rawMessage: MessageEvent) => {
            const data: { id: string } = rawMessage.data
            if (data.id === id) {
                resolve()
                bc.close()
            }
        }
        bc.postMessage({ id, key, value })
    })
}

if (Bun.isMainThread) {
    const kv: { [key: string]: Serializable } = {}
    const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-environment-data`).unref()
    // @ts-ignore
    bc.onmessage = (msg: MessageEvent) => {
        if ('key' in msg.data && 'value' in msg.data) {
            kv[msg.data.key] = msg.data.value
            bc.postMessage({
                id: msg.data.id
            })
        }
        else if ('key' in msg.data) {
            bc.postMessage({
                id: msg.data.id,
                value: kv[msg.data.key]
            })
        }
    }
}