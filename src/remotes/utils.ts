// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { createHash } from "node:crypto"
import type { MaybePromise } from "bun"
import diff from "microdiff"
import typia from "typia"
import type { Playlists, Subscriptions } from "."

export async function compactMap<T1, T2 extends unknown[], T3>(
  array: T1[],
  transform: (value: T1, ...args: T2) => Promise<T3 | undefined>,
  ...args: T2
) {
  const promises = array.map(async value => transform(value, ...args))
  const results = await Promise.all(promises)
  const compacted = results.filter(value => value !== undefined)
  return compacted
}

export async function synchronizeSubscriptions(params: {
  source: Subscriptions
  target: Subscriptions
  subscribe: (channelId: string) => MaybePromise<void>
  unsubscribe: (channelId: string) => MaybePromise<void>
}) {
  const sourceSet = new Set(params.source)
  const targetSet = new Set(params.target)
  const toUnsubscribe = sourceSet.difference(targetSet)
  const toSubscribe = targetSet.difference(sourceSet)
  const promises = []
  promises.push(...toUnsubscribe.values().map(params.unsubscribe))
  promises.push(...toSubscribe.values().map(params.subscribe))
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
  const differences = diff(params.source, params.target, { cyclesFix: false })
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
