// prevents TS errors
declare var self: Worker;

// @ts-expect-error
self.onmessage = (event: MessageEvent) => {
    const funcString: string = event.data.fn
    const argNames: string[] = funcString.substring(funcString.indexOf('(') + 1, funcString.indexOf(')')).split(',')
    const funcBody: string = funcString.substring(funcString.indexOf('{') + 1, funcString.length-1).trim()
    postMessage(Function(...argNames, funcBody).call(undefined, ...event.data.args))
};