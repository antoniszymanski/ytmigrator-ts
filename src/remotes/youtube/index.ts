// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import type { youtube_v3 } from "@googleapis/youtube"
import typia from "typia"
import type { Playlists, Subscriptions, UserData } from ".."
import { compactMap, diffPlaylists, diffSubscriptions } from "../utils"
import { getService } from "./service"

export class YouTube {
  private constructor(private readonly service: youtube_v3.Youtube) {}

  static async create(credentialsPath: string, tokenPath: string) {
    const service = await getService(credentialsPath, tokenPath)
    return new this(service)
  }

  async import(data: UserData) {
    await Promise.all([
      this.importSubscriptions(data.subscriptions), //
      this.importPlaylists(data.playlists),
    ])
  }

  private async importSubscriptions(subscriptions: Subscriptions) {
    const remoteSubscriptions = await this.listSubscriptions()
    const subscriptionIdsByChannelId = new Map<string, string>()
    for (const subscription of remoteSubscriptions) {
      const channelId = typia.assert<string>(subscription.snippet?.resourceId?.channelId)
      const subscriptionId = typia.assert<string>(subscription.id)
      subscriptionIdsByChannelId.set(channelId, subscriptionId)
    }
    const remoteChannelIds = subscriptionIdsByChannelId.keys().toArray()
    const deleteSubscription = async (channelId: string) => {
      const subscriptionId = subscriptionIdsByChannelId.get(channelId)
      if (subscriptionId === undefined) {
        throw new Error("TODO")
      }
      await this.deleteSubscription(subscriptionId)
    }
    const differences = diffSubscriptions(remoteChannelIds, subscriptions)
    for (const difference of differences) {
      switch (true) {
        case typia.is<{ type: "REMOVE"; path: [string] }>(difference):
          await deleteSubscription(difference.path[0])
          break
        case typia.is<{ type: "CREATE"; path: [string] }>(difference):
          await this.insertSubscription(difference.path[0])
          break
        default:
          throw new Error("unreachable")
      }
    }
  }

  /** https://developers.google.com/youtube/v3/docs/subscriptions/delete */
  private async deleteSubscription(subscriptionId: string) {
    await this.service.subscriptions.delete({ id: subscriptionId })
  }

  /** https://developers.google.com/youtube/v3/docs/subscriptions/insert */
  async insertSubscription(channelId: string) {
    await this.service.subscriptions.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          resourceId: {
            channelId,
          },
        },
      },
    })
  }

  private async importPlaylists(playlists: Playlists) {
    const state = new Map(
      await compactMap(await this.listPlaylists(), async playlist => {
        const playlistTitle = typia.assert<string>(playlist.snippet?.title)
        const playlistId = typia.assert<string>(playlist.id)
        const playlistItems = await this.listPlaylistItems(playlistId)
        return [
          playlistTitle,
          {
            playlistId,
            playlistItems,
          },
        ]
      }),
    )

    const deletePlaylist = async (name: string) => {
      const playlistId = state.get(name)?.playlistId
      if (playlistId === undefined) {
        throw new Error("TODO")
      }
      await this.deletePlaylist(playlistId)
      state.delete(name)
    }
    const createPlaylist = async (name: string, videoIds: string[]) => {
      const playlist = await this.insertPlaylist(name)
      const playlistTitle = typia.assert<string>(playlist.snippet?.title)
      const playlistId = typia.assert<string>(playlist.id)
      const playlistItems = await Promise.all(
        videoIds.map((videoId, index) => this.insertPlaylistItem(playlistId, videoId, index)),
      )
      state.set(playlistTitle, { playlistId, playlistItems })
    }
    const deleteVideo = async (playlistName: string, index: number) => {
      const playlistItems = state.get(playlistName)?.playlistItems
      if (playlistItems === undefined) {
        throw new Error("TODO")
      }
      const itemId = playlistItems[index]?.id
      if (itemId == null) {
        throw new Error("TODO")
      }
      await this.deletePlaylistItem(itemId)
      playlistItems.splice(index, 1)
    }
    const createVideo = async (playlistName: string, index: number, id: string) => {
      const playlistId = state.get(playlistName)?.playlistId
      if (playlistId === undefined) {
        throw new Error("TODO")
      }
      await this.insertPlaylistItem(playlistId, id, index)
    }
    const updateVideo = async (playlistName: string, index: number, id: string) => {
      const playlist = state.get(playlistName)
      if (playlist === undefined) {
        throw new Error("TODO")
      }
      const playlistId = playlist.playlistId
      const itemId = playlist.playlistItems[index]?.id
      if (itemId == null) {
        throw new Error("TODO")
      }
      await this.updatePlaylistItem(playlistId, id, itemId)
    }

    const remotePlaylists: Playlists = {}
    for (const [playlistTitle, { playlistItems }] of state) {
      remotePlaylists[playlistTitle] = playlistItems.map(entry =>
        typia.assert<string>(entry.snippet?.resourceId?.videoId),
      )
    }

    const differences = diffPlaylists(remotePlaylists, playlists)
    for (const difference of differences) {
      switch (true) {
        case typia.is<{ type: "REMOVE"; path: [string] }>(difference):
          deletePlaylist(difference.path[0])
          break
        case typia.is<{ type: "CREATE"; path: [string]; value: string[] }>(difference):
          await createPlaylist(difference.path[0], difference.value)
          break
        case typia.is<{ type: "REMOVE"; path: [string, number] }>(difference):
          deleteVideo(difference.path[0], difference.path[1])
          break
        case typia.is<{ type: "CREATE"; path: [string, number]; value: string }>(difference):
          await createVideo(difference.path[0], difference.path[1], difference.value)
          break
        case typia.is<{ type: "CHANGE"; path: [string, number]; value: string }>(difference):
          await updateVideo(difference.path[0], difference.path[1], difference.value)
          break
        default:
          throw new Error("unreachable")
      }
    }
  }

  /** https://developers.google.com/youtube/v3/docs/playlists/delete */
  private async deletePlaylist(playlistId: string) {
    await this.service.subscriptions.delete({ id: playlistId })
  }

  /** https://developers.google.com/youtube/v3/docs/playlists/insert */
  private async insertPlaylist(title: string) {
    const resp = await this.service.playlists.insert({
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title,
        },
        status: {
          privacyStatus: "private",
        },
      },
    })
    return resp.data
  }

  /** https://developers.google.com/youtube/v3/docs/playlistItems/insert */
  private async insertPlaylistItem(playlistId: string, videoId: string, position: number) {
    const resp = await this.service.playlistItems.insert({
      part: ["snippet"],
      requestBody: {
        snippet: {
          playlistId,
          position,
          resourceId: {
            videoId,
          },
        },
      },
    })
    return resp.data
  }

  private async deletePlaylistItem(itemId: string) {
    await this.service.playlistItems.delete({ id: itemId })
  }

  private async updatePlaylistItem(playlistId: string, itemId: string, videoId: string) {
    return await this.service.playlistItems.update({
      part: ["id", "snippet"],
      requestBody: {
        id: itemId,
        snippet: {
          playlistId,
          resourceId: {
            videoId,
          },
        },
      },
    })
  }

  async export(): Promise<UserData> {
    const [subscriptions, playlists] = await Promise.all([this.exportSubscriptions(), this.exportPlaylists()])
    return { subscriptions, playlists }
  }

  private async exportSubscriptions(): Promise<Subscriptions> {
    return (await this.listSubscriptions()).map(entry => {
      const channelId = entry.snippet?.resourceId?.channelId
      typia.assertGuard<string>(channelId)
      return channelId
    })
  }

  /** https://developers.google.com/youtube/v3/docs/subscriptions/list */
  private async listSubscriptions() {
    return await this.list(pageToken =>
      this.service.subscriptions.list({
        part: ["snippet"],
        maxResults: 50,
        mine: true,
        pageToken,
      }),
    )
  }

  private async exportPlaylists(): Promise<Playlists> {
    return Object.fromEntries(
      await compactMap(
        (await this.listPlaylists()).map(entry => {
          const validated = {
            playlistId: entry.id,
            playlistName: entry.snippet?.title,
          }
          typia.assertGuard<{ playlistId: string; playlistName: string }>(validated)
          return validated
        }),
        async ({ playlistId, playlistName }) => {
          const videoIds = (await this.listPlaylistItems(playlistId)).map(entry => {
            const videoId = entry.snippet?.resourceId?.videoId
            typia.assertGuard<string>(videoId)
            return videoId
          })
          return [playlistName, videoIds]
        },
      ),
    )
  }

  private async listPlaylists() {
    return await this.list(pageToken =>
      this.service.playlists.list({
        part: ["snippet"],
        maxResults: 50,
        mine: true,
        pageToken,
      }),
    )
  }

  private async listPlaylistItems(playlistId: string) {
    return await this.list(pageToken =>
      this.service.playlistItems.list({
        part: ["snippet"],
        maxResults: 50,
        playlistId,
        pageToken,
      }),
    )
  }

  private async list<T>(
    fetchPage: (pageToken?: string) => Promise<{ data: { items?: T[]; nextPageToken?: string | null } }>,
  ) {
    const items = []
    let pageToken
    while (true) {
      const resp = await fetchPage(pageToken)
      if (resp.data.items) {
        items.push(...resp.data.items)
      }
      if (resp.data.nextPageToken == null) {
        break
      }
      pageToken = resp.data.nextPageToken
    }
    return items
  }
}
