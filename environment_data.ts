type Serializable = string | object | number | boolean | bigint;

export async function getEnvironmentData(key: Serializable): Promise<Serializable> {
    console.log('get was called')
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

export async function setEnvironmentData(key: Serializable, value: Serializable): Promise<void> {
    console.log('set was called')
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

const kv: { [key:string]: Serializable } = {}
const bc: BroadcastChannel = new BroadcastChannel(`bun-threads-environment-data`).unref()
// @ts-ignore
bc.onmessage = (msg: MessageEvent) => {
    console.log(msg.data)
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