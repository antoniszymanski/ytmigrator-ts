// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { UserData } from ".."

export class File {
  private readonly file
  constructor(
    path: string,
    private readonly format: "json" | "json5" | "yaml",
    private readonly space?: string,
  ) {
    this.file = Bun.file(path)
  }

  async import(data: UserData) {
    let text
    switch (this.format) {
      case "json":
        text = data.toJSON(this.space)
        break
      case "json5":
        text = data.toJSON5(this.space)
        break
      case "yaml":
        text = data.toYAML(this.space)
        break
    }
    await this.file.write(text)
  }

  async export() {
    const text = await this.file.text()
    switch (this.format) {
      case "json":
        return UserData.fromJSON(text)
      case "json5":
        return UserData.fromJSON5(text)
      case "yaml":
        return UserData.fromYAML(text)
    }
  }
}
