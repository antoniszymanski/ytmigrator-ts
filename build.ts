#!/usr/bin/env -S bun run
// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname } from "node:path"
import {
  choice,
  command,
  constant,
  map,
  object,
  option,
  optional,
  or,
  passThrough,
  string,
  withDefault,
} from "@optique/core"
import { path, run } from "@optique/run"
import UnpluginTypia from "@typia/unplugin/bun"
import typia, { type ILlmSchema } from "typia"

const targets = (() => {
  const defs: Record<string, ILlmSchema> = {}
  typia.llm.schema<Bun.Build.CompileTarget>(defs)
  const def = defs["bun.Build.CompileTarget"] as { type: "string"; enum: Bun.Build.CompileTarget[] }
  const unknownTargets = [
    "bun-linux-x64-glibc",
    "bun-linux-arm64-glibc",
    "bun-linux-aarch64-glibc",
    "bun-linux-x64-baseline-glibc",
    "bun-linux-x64-modern-glibc",
    "bun-linux-arm64-baseline-glibc",
    "bun-linux-arm64-modern-glibc",
    "bun-linux-aarch64-baseline-glibc",
    "bun-linux-aarch64-modern-glibc",
  ]
  return def.enum.filter(target => !unknownTargets.includes(target))
})()

const parser = or(
  command(
    "build",
    object({
      action: constant("build"),
      outfile: withDefault(option("--outfile", path({ allowCreate: true })), "./dist/ytmigrator"),
      target: optional(option("--target", choice(targets))),
      bytecode: map(option("--no-bytecode"), o => !o),
    }),
  ),
  command(
    "run",
    object({
      action: constant("run"),
      cwd: withDefault(option("--cwd", path({ mustExist: true, type: "directory" })), process.cwd),
      args: passThrough({ format: "greedy" }),
    }),
  ),
  command(
    "transpile",
    object({
      action: constant("transpile"),
      outdir: withDefault(option("--outdir", path({ mustExist: true, type: "directory" })), "./dist"),
      minify: option("--minify"),
    }),
  ),
  command(
    "targets",
    object({
      action: constant("targets"),
      format: withDefault(option("--format", choice(["json", "json5", "yaml"])), "json"),
      space: optional(option("--space", string({ pattern: /^.{0,10}$/ }))),
    }),
  ),
)

const cli = run(parser, {
  help: "command",
  completion: "command",
  showChoices: {
    maxItems: Infinity,
  },
  showDefault: true,
})

const commonConfig: Bun.BuildConfig = {
  entrypoints: [`${import.meta.dir}/src/index.ts`],
  target: "bun",
  plugins: [UnpluginTypia({ cache: true, log: false })],
  sourcemap: "linked",
  minify: {
    whitespace: true,
    syntax: true,
    identifiers: false,
    keepNames: false,
  },
}

async function main() {
  switch (cli.action) {
    case "build": {
      await Bun.build({
        ...commonConfig,
        compile: {
          ...(cli.target && { target: cli.target }),
          outfile: cli.outfile,
          autoloadBunfig: false,
          autoloadDotenv: false,
        },
        bytecode: cli.bytecode,
      })
      await rm(`${dirname(cli.outfile)}/index.js.map`, { force: true })
      break
    }
    case "run": {
      const dir = await mkdtemp(`${tmpdir()}/`)
      try {
        await Bun.build({ ...commonConfig, outdir: dir })
        await Bun.spawn(["bun", "run", dir, ...cli.args], {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          cwd: cli.cwd,
        }).exited
      } finally {
        await rm(dir, { recursive: true, force: true })
      }
      break
    }
    case "transpile": {
      const config = { ...commonConfig, outdir: cli.outdir }
      if (!cli.minify) {
        delete config.minify
      }
      await Bun.build(config)
      break
    }
    case "targets": {
      let stringify
      switch (cli.format) {
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
      await Bun.stdout.write(stringify(targets, undefined, cli.space) as string)
      break
    }
  }
}
main()
