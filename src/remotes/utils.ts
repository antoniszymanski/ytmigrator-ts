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
  const a = Object.fromEntries(params.source.map(value => [value, undefined]))
  const b = Object.fromEntries(params.target.map(value => [value, undefined]))
  const differences = diff(a, b, { cyclesFix: false })
  for (const difference of differences) {
    switch (true) {
      case typia.is<{ type: "CREATE"; path: [string] }>(difference):
        await params.subscribe(difference.path[0])
        break
      case typia.is<{ type: "REMOVE"; path: [string] }>(difference):
        await params.unsubscribe(difference.path[0])
        break
      default:
        throw new Error("unreachable")
    }
  }
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
    switch (true) {
      case typia.is<{ type: "CREATE"; path: [string]; value: string[] }>(difference):
        await params.createPlaylist(difference.path[0], difference.value)
        break
      case typia.is<{ type: "REMOVE"; path: [string] }>(difference):
        await params.deletePlaylist(difference.path[0])
        break
      case typia.is<{ type: "CREATE"; path: [string, number]; value: string }>(difference):
        await params.addVideo(difference.path[0], difference.path[1], difference.value)
        break
      case typia.is<{ type: "CHANGE"; path: [string, number]; value: string }>(difference):
        await params.updateVideo(difference.path[0], difference.path[1], difference.value)
        break
      case typia.is<{ type: "REMOVE"; path: [string, number] }>(difference):
        await params.removeVideo(difference.path[0], difference.path[1])
        break
      default:
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
