# bun-threads

## A TypeScript Library to Simplify Bun Worker Threads 🧵
bun-threads is a lightweight, developer-friendly TypeScript library that makes it effortless to use the worker threads API for offloading heavy or asynchronous tasks. It wraps the worker thread API with a clean, promise-based interface and TypeScript support, enabling easy parallel processing without boilerplate or separate worker files. bun-threads makes writing multithreaded Javascript and Typescript feel more like writing the asynchronous single threaded code that you are used to writing.

## 🔧 Features
- Simple API: Create and run worker threads using Thread and/or ThreadPool classes.

- Type-Safe: TypeScript support out of the box.

- Automatic Scaling: Manage worker lifecycle and scaling without verbose setup code.

- Low Config: Works out of the box, no setup files or separate worker files required.

## FAQ
### Why not just use one of the existing libraries that does this like multithreading.io, tinypool, poolifier, threads.js, etc?
- They're great projects, but they either don't work in Bun, and/or they require that you to create a separate worker file.

### What makes this library Bun specific? Will it work with Node?
- TODO:
- ~~At the moment this library isn't using any Bun specific APIs and should work with Node. The Bun Worker API is still experimental and still has some bugs in it that make not ready for production use. Once the Bun Worker API stabilizes, support for Node will be dropped.~~
- Reverted to using Bun APIs since Node support not planned anymore.

### I keep getting a ReferenceError: x is not defined error. How do I fix this?
- Check your imports. Worker threads don't have access to your top level imports at the top of your file.
Instead, use dynamic imports inside of your thread's callback function.
- Example:
  ```ts
  import { availableParallelism } from "os";
  const badThread = new Thread(() => {
      console.log(availableParallelism())
  })
  badThread.run() // throws ReferenceError: availableParallelism is not defined

  
  const goodThread = new Thread(async () => {
      const os = await import("os")
      console.log(os.availableParallelism())
  })
  goodThread.run() // works correctly
  ```
