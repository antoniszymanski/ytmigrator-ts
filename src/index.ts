// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import {
  choice,
  command,
  constant,
  type InferValue,
  link,
  map,
  message,
  object,
  option,
  optional,
  or,
  seq,
  string,
  type Usage,
  withDefault,
} from "@optique/core"
import { path, run } from "@optique/run"
import typia from "typia"
import { name as programName, version as programVersion } from "../package.json"
import type { Exporter, Importer } from "./remotes"
import { File } from "./remotes/file"
import { FreeTube } from "./remotes/freetube"
import { PipePipe } from "./remotes/pipepipe"
import { Tubular } from "./remotes/tubular"
import { YouTube } from "./remotes/youtube"
import { UnreachableCaseError } from "./utils"
import { Youtubei } from "./Youtubei"

const REMOTES = <const>{
  file: {
    remote: File,
    options: (type: RemoteType) => {
      let _path, _space
      if (type === "Source") {
        _path = path({ mustExist: true, type: "file" })
        _space = constant(undefined)
      } else {
        _path = path({ allowCreate: true })
        _space = optional(option("--space", string({ pattern: /^.{0,10}$/ })))
      }
      return object(`${type} Options`, {
        path: option("--path", _path),
        format: withDefault(option("--format", choice(["json", "json5", "yaml"])), "json"),
        space: _space,
      })
    },
  },
  freetube: {
    remote: FreeTube,
    options: (type: RemoteType) => {
      let _dir
      if (type === "Source") {
        _dir = path({ mustExist: true, type: "directory" })
      } else {
        _dir = path({ allowCreate: true })
      }
      return object(`${type} Options`, {
        dir: option("--dir", _dir),
      })
    },
  },
  pipepipe: {
    remote: PipePipe,
    options: (type: RemoteType) => {
      return object(`${type} Options`, {
        path: option("--path", path({ extensions: [".zip"], mustExist: true, type: "file" })),
      })
    },
  },
  tubular: {
    remote: Tubular,
    options: (type: RemoteType) => {
      return object(`${type} Options`, {
        path: option("--path", path({ extensions: [".zip"], mustExist: true, type: "file" })),
      })
    },
  },
  youtube: {
    remote: YouTube,
    options: (type: RemoteType) => {
      return object(`${type} Options`, {
        credentials: withDefault(
          option("--credentials", path({ extensions: [".json"], mustExist: true, type: "file" })),
          "credentials.json",
        ),
        token: withDefault(
          option("--token", path({ extensions: [".json"], mustExist: true, type: "file" })),
          "token.json",
        ),
      })
    },
  },
}

type RemoteType = "Source" | "Destination"
type RemoteName = keyof typeof REMOTES
type RemoteEntries = [RemoteName, (typeof REMOTES)[RemoteName]][]

const dst = or(
  ...(Object.entries(REMOTES) as RemoteEntries)
    .filter(([, { remote }]) => Object.hasOwn(remote.prototype, "import"))
    .map(([name, { options }]) =>
      command(
        name,
        map(
          seq(constant(name), options("Destination")), //
          ([remote, options]) => ({ remote, options }),
        ),
      ),
    ),
)

const parser = or(
  ...(Object.entries(REMOTES) as RemoteEntries)
    .filter(([, { remote }]) => Object.hasOwn(remote.prototype, "export"))
    .map(([name, { options }]) =>
      command(
        name,
        map(
          seq(constant(name), options("Source"), dst), //
          ([remote, options, dst]) => ({ remote, options, dst }),
        ),
        { usageLine },
      ),
    ),
)

function usageLine(usage: Usage, ellipsis = false): Usage {
  const filtered = usage
    .filter(term => term.type !== "command" && term.type !== "exclusive")
    .map(term => {
      if (typia.is<{ terms: Usage }>(term)) {
        return { ...term, terms: usageLine(term.terms) }
      } else {
        return term
      }
    })
  if (ellipsis && filtered.length !== usage.length) {
    filtered.push({ type: "ellipsis" })
  }
  return filtered
}

async function main() {
  const cli = run(parser, {
    programName,
    brief: message`Migrate YouTube subscriptions and playlists between various frontends.`,
    author: message`Antoni Szymański ${link("https://github.com/antoniszymanski")}`,
    bugs: message`${link("https://github.com/antoniszymanski/ytmigrator-ts/issues")}`,
    version: {
      value: programVersion,
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
    remote => remote.close?.(),
  )
  const dst = disposer.adopt(
    await createRemote<Importer>(cli.dst.remote, cli.dst.options, youtubei), //
    remote => remote.close?.(),
  )
  const data = await src.export()
  await dst.import(data)
}
main()

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
    case "tubular": {
      const { path } = options as Options<typeof name>
      instance = await CONFIG[name].remote.create(path, youtubei)
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
