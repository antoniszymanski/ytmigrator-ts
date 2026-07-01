// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { constants, Database } from "bun:sqlite"
import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import typia from "typia"
import { LiveVideo } from "youtubei"
import * as zip from "zip-lib"
import { UserData, type Playlists, type Subscriptions } from ".."
import { getVideoAuthor, type Youtubei } from "../../Youtubei"
import { compactMap, synchronizeSubscriptions } from "../utils"

export class PipePipe {
  private constructor(
    private readonly archivePath: string,
    private readonly tmpdirPath: string,
    private readonly db: Database,
    private readonly youtubei: Youtubei,
  ) {}

  static async create(archivePath: string, youtubei: Youtubei) {
    const tmpdirPath = await mkdtemp(`${tmpdir()}/`)
    await zip.extract(archivePath, tmpdirPath, {
      onEntry(event) {
        if (event.entryName !== "newpipe.db" && event.entryName !== "newpipe.settings") {
          event.preventDefault()
        }
      },
    })
    const dbPath = `${tmpdirPath}/newpipe.db`
    const db = new Database(dbPath, { strict: true })
    db.run("PRAGMA journal_mode = WAL")
    return new this(archivePath, tmpdirPath, db, youtubei)
  }

  async close() {
    this.db.fileControl(constants.SQLITE_FCNTL_PERSIST_WAL, 0) // Disable persistent WAL (needed on macOS)
    this.db.run("PRAGMA wal_checkpoint(TRUNCATE)") // Checkpoint and truncate the WAL file
    this.db.close(true)
    await zip.archiveFolder(this.tmpdirPath, this.archivePath, { compressionLevel: 9 })
    await rm(this.tmpdirPath, { recursive: true, force: true })
  }

  async import(data: UserData) {
    await Promise.all([
      this.importSubscriptions(data.subscriptions), //
      this.importPlaylists(data.playlists),
    ])
  }

  private async importSubscriptions(subscriptions: Subscriptions) {
    await synchronizeSubscriptions({
      source: this.exportSubscriptions(),
      target: subscriptions,
      subscribe: async (channelId: string) => {
        const channel = await this.youtubei.getChannel(channelId)
        if (!channel) {
          console.warn(`Failed to get information about the channel with ID ${channelId}`)
          return
        }
        this.db
          .query(
            "INSERT INTO subscriptions (service_id, url, name, avatar_url, description, notification_mode) VALUES (0, ?, ?, ?, ?, 0)",
          )
          .run(channel.url, channel.name, channel.thumbnails?.best ?? null, channel.description ?? null)
      },
      unsubscribe: (channelId: string) => {
        this.db.query("DELETE FROM subscriptions WHERE url = ?").run(channelUrl(channelId))
      },
    })
  }

  private async importPlaylists(playlists: Playlists) {
    this.deletePlaylists()
    await compactMap(
      playlists, //
      async ([playlistName, videoIds]) => {
        const videos = await compactMap(
          videoIds, //
          async videoId => {
            const streamRowId = await this.insertStream(videoId)
            if (streamRowId !== undefined) {
              return { id: videoId, streamRowId }
            }
          },
        )
        let thumbnailUrl = null
        if (videos[0]) {
          const firstVideo = await this.youtubei.getVideo(videos[0].id)
          thumbnailUrl = firstVideo?.thumbnails.best ?? null
        }
        const playlistRowId = this.insertPlaylist(playlistName, thumbnailUrl)
        for (const [index, video] of videos.entries()) {
          this.insertPlaylistStreamJoin(playlistRowId, video.streamRowId, index)
        }
      },
    )
  }

  private deletePlaylists() {
    this.db.query("DELETE FROM playlists").run()
  }

  private insertPlaylist(name: string, thumbnailUrl: string | null) {
    const id = this.db
      .query("INSERT INTO playlists (name, thumbnail_url, display_index) VALUES (?, ?, -1)")
      .run(name, thumbnailUrl).lastInsertRowid
    typia.assertGuard<number>(id)
    return id
  }

  private insertPlaylistStreamJoin(playlistRowId: number, streamRowId: number, joinIndex: number) {
    this.db
      .query("INSERT INTO playlist_stream_join (playlist_id, stream_id, join_index) VALUES (?, ?, ?)")
      .run(playlistRowId, streamRowId, joinIndex)
  }

  private async insertStream(videoId: string) {
    const existingId = this.getStreamByVideoId(videoId)
    if (existingId !== undefined) {
      return existingId
    }
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
    const id = this.db
      .query(
        'INSERT INTO streams (service_id, url, title, stream_type, duration, uploader, uploader_url, thumbnail_url, view_count, is_paid) VALUES (0, $url, $title, "VIDEO_STREAM", $duration, $uploader, $uploaderUrl, $thumbnailUrl, $viewCount, 0)',
      )
      .run({
        url: videoUrl(videoId),
        title: video.title,
        duration: video.duration,
        uploader: channel.name,
        uploaderUrl: channel.url,
        thumbnailUrl: video.thumbnails.best ?? null,
        viewCount: video.viewCount,
      }).lastInsertRowid
    typia.assertGuard<number>(id)
    return id
  }

  private getStreamByVideoId(videoId: string) {
    const row = this.db.query("SELECT uid FROM streams WHERE service_id = 0 AND url = ?").get(videoUrl(videoId))
    typia.assertGuard<{ uid?: number } | null>(row)
    return row?.uid
  }

  export(): UserData {
    return new UserData(this.exportSubscriptions(), this.exportPlaylists())
  }

  private exportSubscriptions(): Subscriptions {
    const channelIds = this.db
      .query("SELECT url FROM subscriptions")
      .all()
      .map(row => {
        typia.assertGuard<{ url: string }>(row)
        return channelId(row.url)
      })
    return new Set(channelIds)
  }

  private exportPlaylists() {
    const rawPlaylists = this.exportRawPlaylists()
    const entries = rawPlaylists
      .entries()
      .map(([name, playlist]) => [name, playlist.videos.map(video => video.id)] as const)
    return new Map(entries)
  }

  private exportRawPlaylists() {
    const entries = this.db
      .query("SELECT uid, name FROM playlists")
      .all()
      .map(row => {
        typia.assertGuard<{ uid: number; name: string }>(row)
        const videos = this.db
          .query("SELECT stream_id FROM playlist_stream_join WHERE playlist_id = ? ORDER BY join_index")
          .all(row.uid)
          .map(row => {
            typia.assertGuard<{ stream_id: number }>(row)
            return row.stream_id
          })
          .map(uid => {
            const row = this.db.query("SELECT url FROM streams WHERE uid = ?").get(uid)
            typia.assertGuard<{ url: string }>(row)
            return { id: videoId(row.url), streamRowId: uid }
          })
        return [row.name, { videos, rowId: row.uid }] as const
      })
    return new Map(entries)
  }
}

const channelUrl = (channelId: string) => `https://www.youtube.com/channel/${channelId}`

function channelId(channelUrl: string) {
  const prefix = "https://www.youtube.com/channel/"
  if (!channelUrl.startsWith(prefix)) {
    throw new Error("TODO")
  }
  return channelUrl.slice(prefix.length)
}

const videoUrl = (videoId: string) => `https://www.youtube.com/watch?v=${videoId}`

function videoId(videoUrl: string) {
  const prefix = "https://www.youtube.com/watch?v="
  if (!videoUrl.startsWith(prefix)) {
    throw new Error("TODO")
  }
  return videoUrl.slice(prefix.length)
}
