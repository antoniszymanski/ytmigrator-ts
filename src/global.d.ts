// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

declare const BUILD_NAME: string
declare const BUILD_VERSION: string

// https://github.com/microsoft/TypeScript/issues/44253#issuecomment-2614240122
declare interface ObjectConstructor {
  hasOwn<O extends object, T extends PropertyKey = keyof O>(x: object, key: T): x is O & { [K in T]: unknown }
  hasOwn(o: object, v: PropertyKey): boolean
}
