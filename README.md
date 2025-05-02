# bun-threads

## A TypeScript Library to Simplify Bun Worker Threads 🧵
bun-threads is a lightweight, developer-friendly TypeScript library for Bun that makes it effortless to offload tasks into separate worker threads. It wraps worker threads and messaging with a clean, promise-based interface and type support, enabling easy parallel processing without any boilerplate or separate worker files. bun-threads makes writing multithreaded JavaScript and TypeScript feel more like writing the asynchronous single threaded code that you are used to.

## 🔧 Features
- Simple API: Create and run worker threads easily using the Thread and ThreadPool classes.

- Type-Safe: Written in pure Typescript. Arguments and return values are automatically typed.

- Automatic Scaling: Manage thread lifecycle and scaling without verbose setup code.

- Low Config: Works out of the box. No setup files or separate worker files required.

- Tested: Uses native bun:test library to ensure proper coverage and code quality.
    File           | % Funcs | % Lines | Uncovered Line #s
    ---------------|---------|---------|-------------------
    All files      |   93.83 |   99.01 |
    thread.ts     |   92.00 |   99.04 | 
    threadpool.ts |   95.65 |   98.99 |

        51 pass

        0 fail

        97 expect() calls
        
        Ran 51 tests across 1 files. [744.00ms]

## ❓ FAQ
### Why not just use one of the existing libraries that does this like workerpool, multithreading<span>.</span>io, tinypool, poolifier, threads.js, etc?
- They're great projects, but they either don't work properly in Bun (workerpool is *almost* there), or they require that you to create a separate worker file, which is something that this library aims to avoid.

### What makes this library Bun specific?
- Currently this library is using one small Bun specific API and Bun's implementation of Node's Worker API. Using Bun's actual native Worker API is planned for the future, but as it's still experimental, it has a few bugs in it that make it unfeasible to use at the moment. Once the native Bun Worker API stabilizes, a full switchover to the native API will be made to take advantage of the performance gains.

### My program is hanging and not exiting after introducing multithreading. Why?
- Make sure that you are calling the `Thread.close()` or `ThreadPool.close()` method when you are done with the instance. Instances of Thread close themselves by default after completing all of their queued `run()` calls if no `idleTimeout` was specified or if `idleTimeout` is set to 0. Instances of ThreadPool keep at least `minThreads` number of Threads open by default for faster startup times on subsequent `run()` calls. Setting an instance of ThreadPool's `minThreads` to 0 will also cause all of it's underlying Thread instances to close themselves after completing each `run()` call, similar to how an instance of a single Thread behaves.

### I keep getting TypeError: Spread syntax requires ...iterable not be null or undefined. What does this mean?
- Make sure that you're passing the correct arguments to the `run()` call. Even if your callback function doesn't have any arguments, you still must pass an empty array. This is required by TypeScript to infer the types of your arguments to provide IntelliSense and code completion.

### I keep getting ReferenceError: x is not defined. How do I fix this?
- Check your imports. Worker threads don't have access to your top level imports at the top of your file. Instead, use dynamic imports inside of your thread's callback function.
  ```ts
  // incorrect example:
  import { availableParallelism } from "os";
  const badThread = new Thread(() => {
      console.log(availableParallelism())
  })
  badThread.run() // throws ReferenceError: availableParallelism is not defined
  
  // correct example:
  const goodThread = new Thread(async () => {
      const os = await import("os")
      console.log(os.availableParallelism())
  })
  goodThread.run() // works correctly
  ```

## Examples

### Quick Multithreading Proof:
```ts
import { Thread } from "bun-threads";

const proof = new Thread(() => Bun.isMainThread)

console.log('Thread isMainThread:', await proof.run([])) // no arguments so pass an empty array
console.log('Main process isMainThread:', Bun.isMainThread)
```

### Simple Demo Function:
```ts
import { Thread } from "bun-threads";

const addThread = new Thread((a: number, b: number) => {
    return a + b
})

addThread.run([21, 21]).then((result) => console.log(result))
```

### Thread vs ThreadPool:
```ts
import { Thread, ThreadPool } from "bun-threads";

const thread = new Thread((wait: number) => Bun.sleepSync(wait)) // simulate some synchronous work
const threadPool = new ThreadPool((wait: number) => Bun.sleepSync(wait)) // simulate some synchronous work

let start = performance.now()
await Promise.all([,
    thread.run([1_000]),
    thread.run([1_000]),
    thread.run([1_000])
])
// a single Thread can only execute synchronous tasks one at a time
console.log('Thread completed in:', performance.now() - start, 'ms') // ~ 3000 ms

start = performance.now()
await Promise.all([,
    threadPool.run([1_000]),
    threadPool.run([1_000]),
    threadPool.run([1_000])
])
// ThreadPool runs each task in a separate Thread in parallel
console.log('ThreadPool completed in:', performance.now() - start, 'ms') // ~ 1000 ms

thread.close()
threadPool.close()
```