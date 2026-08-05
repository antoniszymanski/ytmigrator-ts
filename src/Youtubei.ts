// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { backOff } from "exponential-backoff"
import { pMemoizeDecorator } from "p-memoize"
import { type BaseVideo, Client, type LiveVideo, type Video } from "youtubei"

export class Youtubei extends Client {
  @pMemoizeDecorator()
  override async getVideo<T extends Video | LiveVideo | undefined>(videoId: string) {
    return backOff(async () => super.getVideo<T>(videoId), { numOfAttempts: 3 })
  }

  @pMemoizeDecorator()
  override async getChannel(channelId: string) {
    return backOff(async () => super.getChannel(channelId), { numOfAttempts: 3 })
  }
}

export function getVideoAuthor(video: BaseVideo) {
  if (video.channel) {
    return video.channel
  }
  if (video.channels?.[0]) {
    return video.channels?.[0]
  }
  console.warn(`Failed to get information about the author of the video with ID ${video.id}`)
}
