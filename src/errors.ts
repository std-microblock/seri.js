export class SeriDuplicateNameError extends Error {
  constructor(name: string) {
    super(`Duplicate seri class name: "${name}".`)
    this.name = 'SeriDuplicateNameError'
  }
}

export class SeriTagCollisionError extends Error {
  constructor(tag: number, firstName: string, secondName: string) {
    super(
      `Hash tag collision for tag ${tag} between "${firstName}" and "${secondName}". Rename one class or set an explicit seri name.`,
    )
    this.name = 'SeriTagCollisionError'
  }
}

export class SeriUnknownTagError extends Error {
  constructor(tag: number) {
    super(`Unknown seri tag: ${tag}.`)
    this.name = 'SeriUnknownTagError'
  }
}

export class SeriTypeMismatchError extends Error {
  constructor(expected: string, actual: string) {
    super(`Expected instance of "${expected}", received "${actual}".`)
    this.name = 'SeriTypeMismatchError'
  }
}

export class SeriUnknownReferenceError extends Error {
  constructor(referenceId: number) {
    super(`Unknown seri reference id: ${referenceId}.`)
    this.name = 'SeriUnknownReferenceError'
  }
}

export class SeriCircularReferenceError extends Error {
  constructor() {
    super('Circular references are not supported.')
    this.name = 'SeriCircularReferenceError'
  }
}

export class SeriUnsupportedValueError extends Error {
  constructor(kind: string) {
    super(`Unsupported seri value: ${kind}.`)
    this.name = 'SeriUnsupportedValueError'
  }
}
