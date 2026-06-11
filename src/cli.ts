// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import {
  choice,
  command,
  constant,
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
import { defineProgram } from "@optique/core/program"
import { path } from "@optique/run"
import typia from "typia"
import { name as programName, version as programVersion } from "../package.json"
import { File } from "./remotes/file"
import { FreeTube } from "./remotes/freetube"
import { PipePipe } from "./remotes/pipepipe"
import { YouTube } from "./remotes/youtube"

export const REMOTES = <const>{
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
export type RemoteName = keyof typeof REMOTES
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

export default defineProgram({
  parser,
  metadata: {
    name: programName,
    brief: message`Migrate YouTube subscriptions and playlists between various frontends.`,
    author: message`Antoni Szymański ${link("https://github.com/antoniszymanski")}`,
    bugs: message`${link("https://github.com/antoniszymanski/ytmigrator-ts/issues")}`,
    version: programVersion,
  },
})
