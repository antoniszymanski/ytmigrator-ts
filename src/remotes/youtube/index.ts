// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import typia from "typia"
import { UserData, type Playlists, type Subscriptions } from ".."
import { syncSubscriptions, syncPlaylists } from "../../sync"
import { compactMap } from "../utils"
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

    await syncSubscriptions({
      source,
      target: subscriptions,
      subscribe: async (channelId: string) => {
        await this.api.insertSubscription(channelId)
      },
      unsubscribe: async (channelId: string) => {
        const subscriptionId = state.get(channelId)!
        await this.api.deleteSubscription(subscriptionId)
      },
    })
  }

  private async importPlaylists(playlists: Playlists) {
    const remotePlaylists = await this.api.listPlaylists()
    const entries = await compactMap(
      remotePlaylists, //
      async playlist => {
        const name = typia.assert<string>(playlist.snippet?.title)
        const id = typia.assert<string>(playlist.id)
        const items = await this.api.listPlaylistItems(id)
        const videos = items.map(item => ({
          id: typia.assert<string>(item.snippet?.resourceId?.videoId),
          itemId: typia.assert<string>(item.id),
        }))
        return [name, { id, videos }] as const
      },
    )
    const source = new Map(entries)

    await syncPlaylists({
      source,
      target: playlists,
      createPlaylist: async (name, videoIds) => {
        const playlist = await this.api.insertPlaylist(name)
        const id = typia.assert<string>(playlist.id)
        const itemRromises = videoIds.map(async (videoId, index) => this.api.insertPlaylistItem(id, videoId, index))
        const items = await Promise.all(itemRromises)
        const videos = items
          .filter(item => item !== undefined)
          .map(item => ({
            id: typia.assert<string>(item.snippet?.resourceId?.videoId),
            itemId: typia.assert<string>(item.id),
          }))
        source.set(name, { id, videos })
      },
      renamePlaylist: async (oldName, newName) => {
        const playlist = source.get(oldName)!
        await this.api.renamePlaylist(playlist.id, newName)
        source.delete(oldName)
        source.set(newName, playlist)
      },
      deletePlaylist: async name => {
        const { id } = source.get(name)!
        await this.api.deletePlaylist(id)
        source.delete(name)
      },
      insertVideo: async (playlistName, index, id) => {
        const playlist = source.get(playlistName)!
        const item = await this.api.insertPlaylistItem(playlist.id, id, index)
        if (!item) {
          const remainingVideoIds = playlists.get(playlistName)!.filter(elem => elem !== id)
          playlists.set(playlistName, remainingVideoIds)
          return
        }
        playlist.videos.splice(index, 0, { id, itemId: typia.assert<string>(item.id) })
      },
      removeVideo: async (playlistName, index) => {
        const { videos } = source.get(playlistName)!
        const { itemId } = videos[index]!
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
    const entries = await compactMap(
      playlists, //
      async ({ id, name }) => {
        const playlistItems = await this.api.listPlaylistItems(id)
        const videoIds = playlistItems.map(entry => typia.assert<string>(entry.snippet?.resourceId?.videoId))
        return [name, videoIds] as const
      },
    )
    return new Map(entries)
  }
}
