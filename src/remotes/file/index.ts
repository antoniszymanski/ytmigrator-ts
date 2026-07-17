// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { UserData } from ".."

export class File {
  private readonly file
  private readonly format
  constructor(
    path: string,
    format: "json" | "json5" | "yaml",
    private readonly space?: string,
  ) {
    this.file = Bun.file(path)
    this.format = format.toUpperCase() as Uppercase<typeof format>
  }

  async import(data: UserData) {
    const text = data[`to${this.format}`](this.space)
    await this.file.write(text)
  }

  async export() {
    const text = await this.file.text()
    return UserData[`from${this.format}`](text)
  }
}
