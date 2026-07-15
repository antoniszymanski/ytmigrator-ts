// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { JSON5, YAML, type MaybePromise } from "bun"
import typia, { tags } from "typia"

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
export class UserData {
  constructor(
    public subscriptions: Set<string>,
    public playlists: Map<string, string[] & tags.UniqueItems>,
  ) {}

  static fromJSON(text: string) {
    return this.fromES5(JSON.parse(text))
  }

  static fromJSON5(text: string) {
    return this.fromES5(JSON5.parse(text))
  }

  static fromYAML(text: string) {
    return this.fromES5(YAML.parse(text))
  }

  private static fromES5(input: any) {
    typia.assertGuardEquals<SerializedUserData>(input)
    return new this(new Set(input.subscriptions), new Map(Object.entries(input.playlists)))
  }

  toJSON(space?: string | number) {
    return JSON.stringify(this.toES5(), undefined, space)
  }

  toJSON5(space?: string | number) {
    return JSON5.stringify(this.toES5(), undefined, space) as string
  }

  toYAML(space?: string | number) {
    return YAML.stringify(this.toES5(), undefined, space)
  }

  private toES5(): SerializedUserData {
    return {
      subscriptions: [...this.subscriptions],
      playlists: Object.fromEntries(this.playlists),
    }
  }
}

interface SerializedUserData {
  subscriptions: string[] & tags.UniqueItems
  playlists: Record<string, string[] & tags.UniqueItems>
}

export type Subscriptions = InstanceType<typeof UserData>["subscriptions"]

export type Playlists = InstanceType<typeof UserData>["playlists"]
