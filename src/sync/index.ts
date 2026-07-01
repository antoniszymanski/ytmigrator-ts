// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import type { MaybePromise } from "bun"
import type { Playlists, Subscriptions } from "../remotes"
import { nextPlaylistChange } from "./diff"

export async function syncSubscriptions({
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

export type PlaylistWithMetadata = Map<
  string,
  {
    videos: {
      id: string
      [key: string]: unknown
    }[]
    [key: string]: unknown
  }
>

export async function syncPlaylists({
  source: sourceWithMetadata,
  target,
  createPlaylist,
  renamePlaylist,
  deletePlaylist,
  insertVideo,
  removeVideo,
}: {
  source: PlaylistWithMetadata
  target: Playlists
  createPlaylist: (name: string, videoIds: string[]) => MaybePromise<void>
  renamePlaylist: (oldName: string, newName: string) => MaybePromise<void>
  deletePlaylist: (name: string) => MaybePromise<void>
  insertVideo: (playlistName: string, index: number, id: string) => MaybePromise<void>
  removeVideo: (playlistName: string, index: number) => MaybePromise<void>
}) {
  while (true) {
    const sourceEntries = sourceWithMetadata
      .entries()
      .map(([key, value]) => [key, value.videos.map(video => video.id)] as const)
    const source = new Map(sourceEntries)
    const change = nextPlaylistChange(source, target)
    if (!change) {
      break
    }
    switch (change.type) {
      case "CREATE_PLAYLIST":
        await createPlaylist(change.name, change.videos)
        break
      case "DELETE_PLAYLIST":
        await deletePlaylist(change.name)
        break
      case "RENAME_PLAYLIST":
        await renamePlaylist(change.oldName, change.newName)
        break
      case "INSERT_VIDEO":
        await insertVideo(change.playlistName, change.index, change.value)
        break
      case "REMOVE_VIDEO":
        await removeVideo(change.playlistName, change.index)
        break
    }
  }
}
