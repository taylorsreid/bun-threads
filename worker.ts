// prevents TS errors
declare var self: Worker;

const AsyncFunction = async function () {}.constructor

// @ts-expect-error
self.onmessage = async (event: MessageEvent) => {
    const funcString: string = event.data.fn
    const argNames: string[] = funcString.substring(funcString.indexOf('(') + 1, funcString.indexOf(')')).split(',')
    const funcBody: string = funcString.substring(funcString.indexOf('{') + 1, funcString.length-1).trim()
    if (funcString.startsWith('async')) {
        postMessage(await AsyncFunction(...argNames, funcBody).call(undefined, ...event.data.args))
    }
    else {
        postMessage(Function(...argNames, funcBody).call(undefined, ...event.data.args))
    }
};