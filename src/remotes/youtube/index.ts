// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import typia from "typia"
import type { Playlists, Subscriptions, UserData } from ".."
import { compactMap, synchronizePlaylists, synchronizeSubscriptions } from "../utils"
import { YouTubeApi } from "./api"

export class YouTube {
  private constructor(private readonly api: YouTubeApi) {}

  static async create(credentialsPath: string, tokenPath: string) {
    const api = await YouTubeApi.create(credentialsPath, tokenPath)
    return new this(api)
  }

  async import(data: UserData) {
    await Promise.all([
      this.importSubscriptions(data.subscriptions), //
      this.importPlaylists(data.playlists),
    ])
  }

  private async importSubscriptions(subscriptions: Subscriptions) {
    const remoteSubscriptions = await this.api.listSubscriptions()
    const subscriptionIdsByChannelId = new Map<string, string>()
    for (const subscription of remoteSubscriptions) {
      const channelId = typia.assert<string>(subscription.snippet?.resourceId?.channelId)
      const subscriptionId = typia.assert<string>(subscription.id)
      subscriptionIdsByChannelId.set(channelId, subscriptionId)
    }
    const remoteChannelIds = subscriptionIdsByChannelId.keys().toArray()
    await synchronizeSubscriptions({
      source: remoteChannelIds,
      target: subscriptions,
      subscribe: this.api.insertSubscription.bind(this),
      unsubscribe: async (channelId: string) => {
        const subscriptionId = subscriptionIdsByChannelId.get(channelId)
        if (subscriptionId === undefined) {
          throw new Error("TODO")
        }
        await this.api.deleteSubscription(subscriptionId)
      },
    })
  }

  private async importPlaylists(playlists: Playlists) {
    const state = new Map(
      await compactMap(await this.api.listPlaylists(), async playlist => {
        const playlistTitle = typia.assert<string>(playlist.snippet?.title)
        const playlistId = typia.assert<string>(playlist.id)
        const playlistItems = await this.api.listPlaylistItems(playlistId)
        return [
          playlistTitle,
          {
            playlistId,
            playlistItems,
          },
        ]
      }),
    )
    const remotePlaylists: Playlists = {}
    for (const [playlistTitle, { playlistItems }] of state) {
      remotePlaylists[playlistTitle] = playlistItems.map(entry =>
        typia.assert<string>(entry.snippet?.resourceId?.videoId),
      )
    }
    await synchronizePlaylists({
      source: remotePlaylists,
      target: playlists,
      createPlaylist: async (name: string, videoIds: string[]) => {
        const playlist = await this.api.insertPlaylist(name)
        const playlistTitle = typia.assert<string>(playlist.snippet?.title)
        const playlistId = typia.assert<string>(playlist.id)
        const playlistItems = await Promise.all(
          videoIds.map(async (videoId, index) => this.api.insertPlaylistItem(playlistId, videoId, index)),
        )
        state.set(playlistTitle, { playlistId, playlistItems })
      },
      deletePlaylist: async (name: string) => {
        const playlistId = state.get(name)?.playlistId
        if (playlistId === undefined) {
          throw new Error("TODO")
        }
        await this.api.deletePlaylist(playlistId)
        state.delete(name)
      },
      addVideo: async (playlistName: string, index: number, id: string) => {
        const playlistId = state.get(playlistName)?.playlistId
        if (playlistId === undefined) {
          throw new Error("TODO")
        }
        await this.api.insertPlaylistItem(playlistId, id, index)
      },
      updateVideo: async (playlistName: string, index: number, id: string) => {
        const playlist = state.get(playlistName)
        if (playlist === undefined) {
          throw new Error("TODO")
        }
        const playlistId = playlist.playlistId
        const itemId = playlist.playlistItems[index]?.id
        if (itemId == null) {
          throw new Error("TODO")
        }
        await this.api.updatePlaylistItem(playlistId, itemId, id)
      },
      removeVideo: async (playlistName: string, index: number) => {
        const playlistItems = state.get(playlistName)?.playlistItems
        if (playlistItems === undefined) {
          throw new Error("TODO")
        }
        const itemId = playlistItems[index]?.id
        if (itemId == null) {
          throw new Error("TODO")
        }
        await this.api.deletePlaylistItem(itemId)
        playlistItems.splice(index, 1)
      },
    })
  }

  async export(): Promise<UserData> {
    const [subscriptions, playlists] = await Promise.all([this.exportSubscriptions(), this.exportPlaylists()])
    return { subscriptions, playlists }
  }

  private async exportSubscriptions(): Promise<Subscriptions> {
    return (await this.api.listSubscriptions()).map(entry => {
      const channelId = entry.snippet?.resourceId?.channelId
      typia.assertGuard<string>(channelId)
      return channelId
    })
  }

  private async exportPlaylists(): Promise<Playlists> {
    return Object.fromEntries(
      await compactMap(
        (await this.api.listPlaylists()).map(entry => {
          const validated = {
            playlistId: entry.id,
            playlistName: entry.snippet?.title,
          }
          typia.assertGuard<{ playlistId: string; playlistName: string }>(validated)
          return validated
        }),
        async ({ playlistId, playlistName }) => {
          const videoIds = (await this.api.listPlaylistItems(playlistId)).map(entry => {
            const videoId = entry.snippet?.resourceId?.videoId
            typia.assertGuard<string>(videoId)
            return videoId
          })
          return [playlistName, videoIds]
        },
      ),
    )
  }
}
