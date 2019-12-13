module.exports = {
  isExtension,
  checkConstructor,
  notImplemented,
}

/**
 * Checks whether an object is an instance of the provided class object.
 *
 * Used to provide static instance checks in interface classes.
 *
 * @param {object} instance The created instance of to ensure is an instance of the class.
 * @param {object} classObject The class constructor object to ensure the instance is a part of.
 */
function isExtension(instance, classObject) {
  return instance.constructor.prototype instanceof classObject
}

/**
 * Used in interface constructors to ensure a valid extension has been created.
 *
 * @param {object} instance The `this` instance passed into the constructor.
 * @param {object} classObject The class instance used for comparisons.
 */
function checkConstructor(instance, classObject) {
  if (instance.constructor === classObject) {
    throw new Error(
      `The ${classObject.name} class must be extended with a concrete implementation before use.`
    )
  }
}

/**
 * Used in stub methods of interfaces.
 *
 * Throws an error indicating the name of the function needing an implementation.
 */
function notImplemented() {
  const err = new Error()
  const stackTrace = err.stack

  // Parse the stack trace accounting for different environments
  let callerName = stackTrace.replace(/^Error\s+/, '') // Sanitize Chrome
  callerName = callerName.split('\n')[1] // 1st item is this, 2nd item is caller
  callerName = callerName.replace(/^\s+at Object./, '') // Sanitize Chrome
  callerName = callerName.replace(/ \(.+\)$/, '') // Sanitize Chrome
  callerName = callerName.replace(/@.+/, '') // Sanitize Firefox
  callerName = callerName.replace(/at\s/, '') // Sanitize Node
  callerName = callerName.trim()
  throw new Error(`The method ${callerName} must be implemented in a subclass.`)
}
