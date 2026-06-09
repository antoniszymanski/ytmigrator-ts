// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

// https://github.com/FreeTubeApp/FreeTube/issues/4567

export interface Subscriptions {
  _id: string
  name: string
  bgColor: string
  textColor: string
  subscriptions: SubscriptionChannel[]
}

export interface SubscriptionChannel {
  id: string
  name: string
  thumbnail?: string
}

export interface Playlist {
  playlistName: string
  protected: boolean
  description: string
  videos: Video[]
  _id: string
  createdAt: number
  lastUpdatedAt: number
}

export interface Video {
  videoId: string
  title: string
  author: string
  authorId: string
  lengthSeconds: number
  timeAdded: number
  playlistItemId: string
  type: "video"
}
