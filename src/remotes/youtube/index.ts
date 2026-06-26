// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import typia from "typia"
import { UserData, type Playlists, type Subscriptions } from ".."
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
    const stateEntries = remoteSubscriptions.map(subscription => {
      const channelId = typia.assert<string>(subscription.snippet?.resourceId?.channelId)
      const subscriptionId = typia.assert<string>(subscription.id)
      return [channelId, subscriptionId] as const
    })
    const state = new Map(stateEntries)
    const source = new Set(state.keys())

    await synchronizeSubscriptions({
      source,
      target: subscriptions,
      subscribe: this.api.insertSubscription.bind(this),
      unsubscribe: async (channelId: string) => {
        const subscriptionId = state.get(channelId)
        if (subscriptionId === undefined) {
          throw new Error("TODO")
        }
        await this.api.deleteSubscription(subscriptionId)
      },
    })
  }

  private async importPlaylists(playlists: Playlists) {
    const remotePlaylists = await this.api.listPlaylists()
    const stateEntries = await compactMap(remotePlaylists, async playlist => {
      const name = typia.assert<string>(playlist.snippet?.title)
      const id = typia.assert<string>(playlist.id)
      const items = await this.api.listPlaylistItems(id)
      const videos = items.map(item => ({
        id: typia.assert<string>(item.snippet?.resourceId?.videoId),
        itemId: typia.assert<string>(item.id),
      }))
      return [name, { id, videos }] as const
    })
    const state = new Map(stateEntries)

    const sourceEntries = state
      .entries() //
      .map(([name, { videos }]) => [name, videos.map(video => video.id)] as const)
    const source = new Map(sourceEntries)

    await synchronizePlaylists({
      source,
      target: playlists,
      createPlaylist: async (name: string, videoIds: string[]) => {
        const playlist = await this.api.insertPlaylist(name)
        const id = typia.assert<string>(playlist.id)
        const itemPromises = videoIds.map(async (videoId, index) => this.api.insertPlaylistItem(id, videoId, index))
        const items = await Promise.all(itemPromises)
        const videos = items.map(item => ({
          id: typia.assert<string>(item.snippet?.resourceId?.videoId),
          itemId: typia.assert<string>(item.id),
        }))
        state.set(name, { id, videos })
      },
      deletePlaylist: async (name: string) => {
        const id = state.get(name)?.id
        if (id === undefined) {
          throw new Error("TODO")
        }
        await this.api.deletePlaylist(id)
        state.delete(name)
      },
      addVideo: async (playlistName: string, index: number, id: string) => {
        const playlistId = state.get(playlistName)?.id
        if (playlistId === undefined) {
          throw new Error("TODO")
        }
        await this.api.insertPlaylistItem(playlistId, id, index)
      },
      updateVideo: async (playlistName: string, index: number, id: string) => {
        const playlist = state.get(playlistName)
        if (!playlist) {
          throw new Error("TODO")
        }
        const itemId = playlist.videos[index]?.itemId
        if (itemId === undefined) {
          throw new Error("TODO")
        }
        await this.api.updatePlaylistItem(playlist.id, itemId, id)
      },
      removeVideo: async (playlistName: string, index: number) => {
        const videos = state.get(playlistName)?.videos
        if (!videos) {
          throw new Error("TODO")
        }
        const itemId = videos[index]?.itemId
        if (itemId === undefined) {
          throw new Error("TODO")
        }
        await this.api.deletePlaylistItem(itemId)
        videos.splice(index, 1)
      },
    })
  }

  async export(): Promise<UserData> {
    const [subscriptions, playlists] = await Promise.all([this.exportSubscriptions(), this.exportPlaylists()])
    return new UserData(subscriptions, playlists)
  }

  private async exportSubscriptions(): Promise<Subscriptions> {
    const remoteSubscriptions = await this.api.listSubscriptions()
    const channelIds = remoteSubscriptions.map(entry => typia.assert<string>(entry.snippet?.resourceId?.channelId))
    return new Set(channelIds)
  }

  private async exportPlaylists(): Promise<Playlists> {
    const remotePlaylists = await this.api.listPlaylists()
    const playlists = remotePlaylists.map(entry => ({
      id: typia.assert<string>(entry.id),
      name: typia.assert<string>(entry.snippet?.title),
    }))
    const entries = await compactMap(playlists, async ({ id, name }) => {
      const playlistItems = await this.api.listPlaylistItems(id)
      const videoIds = playlistItems.map(entry => typia.assert<string>(entry.snippet?.resourceId?.videoId))
      return [name, videoIds] as const
    })
    return new Map(entries)
  }
}
