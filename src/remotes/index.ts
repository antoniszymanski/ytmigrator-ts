// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import type { MaybePromise } from "bun"

export interface Importer extends Closer {
  import(data: UserData): MaybePromise<void>
}

export interface Exporter extends Closer {
  export(): MaybePromise<UserData>
}

export interface Closer {
  close?(): MaybePromise<void>
}

// TODO: rename
export interface UserData {
  subscriptions: Subscriptions
  playlists: Playlists
}

export type Subscriptions = string[]

export interface Playlists {
  [key: string]: string[]
}
