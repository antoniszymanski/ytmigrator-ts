// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import type { InferValue } from "@optique/core"
import { run } from "@optique/run"
import program, { REMOTES, type RemoteName } from "./cli"
import type { Exporter, Importer } from "./remotes"
import { UnreachableCaseError } from "./utils"
import { Youtubei } from "./Youtubei"

async function main() {
  const cli = run(program, {
    version: {
      value: BUILD_VERSION,
      command: true,
    },
    help: "command",
    completion: "command",
    showDefault: true,
    showChoices: true,
    sectionOrder(a, b) {
      if (a.title === "Source Options" && b.title === "Destination Options") {
        return -1
      } else if (a.title === "Destination Options" && b.title === "Source Options") {
        return 1
      } else {
        return 0
      }
    },
  })
  await using disposer = new AsyncDisposableStack()
  const youtubei = new Youtubei()
  const src = disposer.adopt(
    await createRemote<Exporter>(cli.remote, cli.options, youtubei), //
    async remote => remote.close?.(),
  )
  const dst = disposer.adopt(
    await createRemote<Importer>(cli.dst.remote, cli.dst.options, youtubei), //
    async remote => remote.close?.(),
  )
  const data = await src.export()
  await dst.import(data)
}
void main()

async function createRemote<T>(name: RemoteName, options: unknown, youtubei: Youtubei) {
  type Options<Name extends RemoteName> = InferValue<ReturnType<(typeof REMOTES)[Name]["options"]>>
  let instance
  switch (name) {
    case "file": {
      const { path, format, space } = options as Options<typeof name>
      instance = new REMOTES[name].remote(path, format, space)
      break
    }
    case "freetube": {
      const { dir } = options as Options<typeof name>
      instance = new REMOTES[name].remote(dir, youtubei)
      break
    }
    case "pipepipe": {
      const { path } = options as Options<typeof name>
      instance = await REMOTES[name].remote.create(path, youtubei)
      break
    }
    case "youtube": {
      const { credentials, token } = options as Options<typeof name>
      instance = await REMOTES[name].remote.create(credentials, token)
      break
    }
    default:
      throw new UnreachableCaseError(name)
  }
  return instance as T
}
