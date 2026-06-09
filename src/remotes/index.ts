// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

export interface Importer extends Closer {
  import(data: UserData): MaybePromise<void>
}

export interface Exporter extends Closer {
  export(): MaybePromise<UserData>
}

export interface Closer {
  close?(): MaybePromise<void>
}

export type MaybePromise<T> = T | Promise<T>

// TODO: rename
export interface UserData {
  subscriptions: Subscriptions
  playlists: Playlists
}

/**
 * @elem channel ID
 */
export type Subscriptions = string[]

/**
 * @key playlist title
 * @value video IDs
 */
export interface Playlists {
  [key: string]: string[]
}
