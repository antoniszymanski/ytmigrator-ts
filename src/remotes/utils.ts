// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { createHash } from "node:crypto"
import diff from "microdiff"
import type { Playlists, Subscriptions } from "."

export async function compactMap<T1, T2 extends unknown[], T3>(
  array: T1[],
  transform: (value: T1, ...args: T2) => Promise<T3 | undefined>,
  ...args: T2
) {
  return (await Promise.all(array.map(value => transform(value, ...args)))).filter(value => value !== undefined)
}

export function diffSubscriptions(a: Subscriptions, b: Subscriptions) {
  return diff(
    Object.fromEntries(a.map(value => [value, undefined])),
    Object.fromEntries(b.map(value => [value, undefined])),
    { cyclesFix: false },
  )
}

export function diffPlaylists(a: Playlists, b: Playlists) {
  return diff(a, b, { cyclesFix: false })
}

export function sha256(data: string) {
  return createHash("sha256").update(data).digest("hex")
}

export function rapidhash(data: string) {
  return Bun.hash.rapidhash(data).toString(16)
}
