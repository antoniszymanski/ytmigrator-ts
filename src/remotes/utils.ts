// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { createHash } from "node:crypto"

export async function compactMap<T1, T2 extends unknown[], T3>(
  iterable: Iterable<T1>,
  transform: (value: T1, ...args: T2) => Promise<T3 | undefined>,
  ...args: T2
) {
  const promises = Iterator.from(iterable).map(async value => transform(value, ...args))
  const results = await Promise.all(promises)
  const compacted = results.filter(value => value !== undefined)
  return compacted
}

export function sha256(data: string) {
  return createHash("sha256").update(data).digest("hex")
}

export function rapidhash(data: string) {
  return Bun.hash.rapidhash(data).toString(16)
}
