// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

export class UnreachableCaseError extends Error {
  constructor(value: never) {
    super(`Unreachable case: ${value}`)
  }
}
