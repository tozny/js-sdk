class StreamTransformer {
  constructor(transformer, end, context) {
    this._then = false
    this.transformer = transformer
    this.end = end
    this.context = context
  }
  then(next, end) {
    if (this._then) {
      throw new Error('Only one `.then` can be applied to a stream transformer')
    }
    if (typeof next === 'function') {
      next = new StreamTransformer(next, end, this.context)
    }
    if (!(next instanceof StreamTransformer)) {
      throw new Error('Unable to use `next` as a StreamReducer')
    }
    this._then = next
    return next
  }
  async transform(source, chunk) {
    // Internal transformation state and associated user control methods
    let doThen = false
    let previous
    const control = {
      done: extra => {
        doThen = true
        previous = { value: extra }
      },
      continue: (value, append) => {
        previous = { value, append }
      },
    }
    // Use the sent chunk if available or get the first chunk from source
    chunk = chunk || (await source.read())
    // Process chunks until the transformer says it is done, or source is empty
    // empty = done is reported and there is no data in the value
    while (
      doThen === false &&
      (!chunk.done ||
        (chunk.value instanceof Uint8Array && chunk.value.length > 0))
    ) {
      const _chunk = chunk.value
      await this.transformer(_chunk, this.context, control)
      if (!previous) {
        chunk = await source.read()
      } else {
        if (previous.append) {
          const next = await source.read()
          const full = new Uint8Array(previous.value.length + next.value.length)
          full.set(previous.value, 0)
          full.set(next.value, previous.value.length)
          previous.value = full
        }
        chunk = {
          value: previous.value,
          done: false,
        }
        previous = undefined
      }
    }
    // Call the end function if one has been provided giving it the context and
    // whether the completion was due to the source being empty or because the
    // transformer called the done control method.
    if (this.end) {
      await this.end(this.context, chunk.done)
    }
    // Pass the source and any remaining chunk split data to the next transformer
    // if one is present.
    if (doThen && this._then instanceof StreamTransformer) {
      this._then.transform(source, chunk)
    }
  }
}

module.exports = StreamTransformer
