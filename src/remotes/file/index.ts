// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import typia from "typia"
import type { UserData } from ".."

export class File {
  private readonly file: Bun.BunFile
  constructor(
    path: string,
    private readonly format: "json" | "json5" | "yaml",
    private readonly space?: string,
  ) {
    this.file = Bun.file(path)
  }

  async import(data: UserData) {
    let stringify
    switch (this.format) {
      case "json": {
        stringify = JSON.stringify
        break
      }
      case "json5": {
        stringify = Bun.JSON5.stringify
        break
      }
      case "yaml": {
        stringify = Bun.YAML.stringify
        break
      }
    }
    await this.file.write(stringify(data, undefined, this.space) as string)
  }

  async export() {
    const text = await this.file.text()
    let data
    switch (this.format) {
      case "json": {
        data = JSON.parse(text)
        break
      }
      case "json5": {
        data = Bun.JSON5.parse(text)
        break
      }
      case "yaml": {
        data = Bun.YAML.parse(text)
        break
      }
    }
    typia.assertGuardEquals<UserData>(data)
    data.subscriptions = [...new Set(data.subscriptions)]
    return data
  }
}
