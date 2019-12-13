module.exports = {
  setup() {},
  teardown() {},
  run(func, ...args) {
    return func.apply(null, args)
  },
}
