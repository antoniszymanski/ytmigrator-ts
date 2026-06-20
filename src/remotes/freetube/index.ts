// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { randomUUID } from "node:crypto"
import typia from "typia"
import { LiveVideo } from "youtubei"
import type { Playlists, Subscriptions, UserData } from ".."
import { getVideoAuthor, type Youtubei } from "../../Youtubei"
import { compactMap, sha256 } from "../utils"
import * as colors from "./colors"
import type * as models from "./models"

export class FreeTube {
  constructor(
    private readonly dir: string,
    private readonly youtubei: Youtubei,
  ) {}

  async import(data: UserData) {
    await Promise.all([
      this.importSubscriptions(data.subscriptions), //
      this.importPlaylists(data.playlists),
    ])
  }

  private async importSubscriptions(subscriptions: Subscriptions) {
    const bgColor = colors.getRandomColor()
    const textColor = colors.calculateColorLuminance(bgColor)
    const data = typia.json.stringify<models.Subscriptions>({
      _id: "allChannels",
      name: "Profile.All Channels",
      bgColor,
      textColor,
      subscriptions: await compactMap(subscriptions, this.processChannelEntry),
    })
    await Bun.write(`${this.dir}/subscriptions.db`, `${data}\n`)
  }

  private readonly processChannelEntry = async (channelId: string) => {
    const channel = await this.youtubei.getChannel(channelId)
    if (!channel) {
      console.warn(`Failed to get information about the channel with ID ${channelId}`)
      return
    }
    return {
      id: channelId,
      name: channel.name,
      thumbnail: channel.thumbnails?.best,
    }
  }

  private async importPlaylists(playlists: Playlists) {
    const data = (await compactMap(Object.entries(playlists), this.processPlaylistEntry, Date.now()))
      .map(elem => typia.json.stringify(elem))
      .join("\n")
    await Bun.write(`${this.dir}/playlists.db`, `${data}\n`)
  }

  private readonly processPlaylistEntry = async (
    [playlistName, videoIds]: [string, string[]],
    now: number,
  ): Promise<models.Playlist> => {
    return {
      playlistName,
      protected: false,
      description: "",
      videos: await compactMap(videoIds, this.processVideoEntry, now),
      _id: sha256(playlistName),
      createdAt: now,
      lastUpdatedAt: now,
    }
  }

  private readonly processVideoEntry = async (videoId: string, now: number): Promise<models.Video | undefined> => {
    const video = await this.youtubei.getVideo(videoId)
    if (!video) {
      console.warn(`Failed to get information about the video with ID ${videoId}`)
      return
    } else if (video instanceof LiveVideo) {
      console.warn(`The video with ID ${videoId} is currently live`)
      return
    }
    const channel = getVideoAuthor(video)
    if (!channel) {
      return
    }
    return {
      videoId,
      title: video.title,
      author: channel.name,
      authorId: channel.id,
      lengthSeconds: video.duration,
      timeAdded: now,
      playlistItemId: randomUUID(),
      type: "video",
    }
  }
}
