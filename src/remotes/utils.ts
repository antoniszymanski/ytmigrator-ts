// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { createHash } from "node:crypto"
import type { MaybePromise } from "bun"
import diff from "microdiff"
import typia from "typia"
import type { Playlists, Subscriptions } from "."

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

export async function synchronizeSubscriptions({
  source,
  target,
  subscribe,
  unsubscribe,
}: {
  source: Subscriptions
  target: Subscriptions
  subscribe: (channelId: string) => MaybePromise<void>
  unsubscribe: (channelId: string) => MaybePromise<void>
}) {
  const toUnsubscribe = source.difference(target)
  const toSubscribe = target.difference(source)
  const promises = []
  promises.push(...toUnsubscribe.values().map(unsubscribe))
  promises.push(...toSubscribe.values().map(subscribe))
  // oxlint-disable-next-line typescript/await-thenable
  await Promise.all(promises)
}

export async function synchronizePlaylists(params: {
  source: Playlists
  target: Playlists
  createPlaylist: (name: string, videoIds: string[]) => MaybePromise<void>
  deletePlaylist: (name: string) => MaybePromise<void>
  addVideo: (playlistName: string, index: number, id: string) => MaybePromise<void>
  updateVideo: (playlistName: string, index: number, id: string) => MaybePromise<void>
  removeVideo: (playlistName: string, index: number) => MaybePromise<void>
}) {
  const a = Object.fromEntries(params.source.entries())
  const b = Object.fromEntries(params.target.entries())
  const differences = diff(a, b, { cyclesFix: false })
  for (const difference of differences) {
    if (typia.is<{ type: "CREATE"; path: [string]; value: string[] }>(difference)) {
      await params.createPlaylist(difference.path[0], difference.value)
    } else if (typia.is<{ type: "REMOVE"; path: [string] }>(difference)) {
      await params.deletePlaylist(difference.path[0])
    } else if (typia.is<{ type: "CREATE"; path: [string, number]; value: string }>(difference)) {
      await params.addVideo(difference.path[0], difference.path[1], difference.value)
    } else if (typia.is<{ type: "CHANGE"; path: [string, number]; value: string }>(difference)) {
      await params.updateVideo(difference.path[0], difference.path[1], difference.value)
    } else if (typia.is<{ type: "REMOVE"; path: [string, number] }>(difference)) {
      await params.removeVideo(difference.path[0], difference.path[1])
    } else {
      throw new Error("unreachable")
    }
  }
}

export function sha256(data: string) {
  return createHash("sha256").update(data).digest("hex")
}

export function rapidhash(data: string) {
  return Bun.hash.rapidhash(data).toString(16)
}
