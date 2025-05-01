import { parentPort } from "worker_threads";

const AsyncFunction = async function () { }.constructor
let fn: Function

parentPort?.on('message', async (event: any) => {
    if (event.action === 'set') {
        const argNames: string[] = event.data.substring(event.data.indexOf('(') + 1, event.data.indexOf(')')).split(',')
        const funcBody: string = event.data.substring(event.data.indexOf('{') + 1, event.data.length - 1).trim()
        if (event.data.startsWith('async')) {
            fn = AsyncFunction(...argNames, funcBody)
        }
        else {
            fn = Function(...argNames, funcBody)
        }
    }
    else if (event.action === 'call') {
        try {
            parentPort?.postMessage({
                id: event.id,
                action: 'resolve',
                data: await fn.call(undefined, ...event.data)
            })
        } catch (error) {
            parentPort?.postMessage({
                id: event.id,
                action: 'reject',
                data: error instanceof ReferenceError ? new ReferenceError(error.message + `.\nThis is usually caused by referencing top level imports within your Thread's callback function.\nOnly dynamic imports made inside of the Thread's callback function are supported.\nPlease see the README for examples.`) : error
            })
        }
    }
})