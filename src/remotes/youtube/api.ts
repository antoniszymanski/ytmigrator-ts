// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { youtube_v3 } from "@googleapis/youtube"
import { getAuth } from "./auth"

export class YouTubeApi {
  private constructor(private readonly service: youtube_v3.Youtube) {}

  static async create(credentialsPath: string, tokenPath: string) {
    const auth = await getAuth(credentialsPath, tokenPath)
    const service = new youtube_v3.Youtube({ auth })
    return new this(service)
  }

  /** https://developers.google.com/youtube/v3/docs/subscriptions/list */
  async listSubscriptions() {
    return await this.list(pageToken =>
      this.service.subscriptions.list({
        part: ["snippet"],
        maxResults: 50,
        mine: true,
        pageToken,
      }),
    )
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

  /** https://developers.google.com/youtube/v3/docs/subscriptions/delete */
  async deleteSubscription(subscriptionId: string) {
    await this.service.subscriptions.delete({ id: subscriptionId })
  }

  /** https://developers.google.com/youtube/v3/docs/playlists/list */
  async listPlaylists() {
    return await this.list(pageToken =>
      this.service.playlists.list({
        part: ["snippet"],
        maxResults: 50,
        mine: true,
        pageToken,
      }),
    )
  }

  /** https://developers.google.com/youtube/v3/docs/playlists/insert */
  async insertPlaylist(title: string) {
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

  /** https://developers.google.com/youtube/v3/docs/playlists/delete */
  async deletePlaylist(playlistId: string) {
    await this.service.playlists.delete({ id: playlistId })
  }

  /** https://developers.google.com/youtube/v3/docs/playlistItems/list */
  async listPlaylistItems(playlistId: string) {
    return await this.list(pageToken =>
      this.service.playlistItems.list({
        part: ["snippet"],
        maxResults: 50,
        playlistId,
        pageToken,
      }),
    )
  }

  /** https://developers.google.com/youtube/v3/docs/playlistItems/insert */
  async insertPlaylistItem(playlistId: string, videoId: string, position: number) {
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

  /** https://developers.google.com/youtube/v3/docs/playlistItems/delete */
  async deletePlaylistItem(itemId: string) {
    await this.service.playlistItems.delete({ id: itemId })
  }

  /** https://developers.google.com/youtube/v3/docs/playlistItems/update */
  async updatePlaylistItem(playlistId: string, itemId: string, videoId: string) {
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
