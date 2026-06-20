// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import type { youtube_v3 } from "@googleapis/youtube"
import typia from "typia"
import type { Playlists, Subscriptions, UserData } from ".."
import { compactMap } from "../utils"
import { getService } from "./service"

export class YouTube {
  private constructor(private readonly service: youtube_v3.Youtube) {}

  static async create(credentialsPath: string, tokenPath: string) {
    const service = await getService(credentialsPath, tokenPath)
    return new this(service)
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
