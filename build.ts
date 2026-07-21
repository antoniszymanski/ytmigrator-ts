#!/usr/bin/env -S bun run
// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { dirname } from "node:path"
import { choice, object, option, passThrough, string } from "@optique/core"
import { runProgram } from "@optique/discover"
import { defineCommand } from "@optique/discover/command"
import { path } from "@optique/run"
import ttsc from "@ttsc/unplugin/bun"
import { $ } from "bun"
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

const commonConfig: Bun.BuildConfig = {
  entrypoints: [`${import.meta.dir}/src/index.ts`],
  target: "bun",
  plugins: [ttsc()],
  sourcemap: "linked",
  minify: {
    whitespace: true,
    syntax: true,
    identifiers: false,
    keepNames: false,
  },
  define: {
    BUILD_NAME: JSON.stringify("ytmigrator"),
    BUILD_VERSION: JSON.stringify((await $`git describe --tags --always`.text()).trim()),
  },
}

const commands = [
  defineCommand({
    path: ["build"],
    parser: object({
      outfile: option("--outfile", path({ allowCreate: true })).withDefault("./dist/ytmigrator"),
      target: option("--target", choice(targets)).optional(),
      bytecode: option("--no-bytecode").map(o => !o),
    }),
    async handler(cli) {
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
    },
  }),
  defineCommand({
    path: ["run"],
    parser: object({
      cwd: option("--cwd", path({ mustExist: true, type: "directory" })).withDefault(process.cwd()),
      args: passThrough({ format: "greedy" }),
    }),
    async handler(cli) {
      await using disposer = new AsyncDisposableStack()
      const dir = disposer.adopt(
        await mkdtemp(`${tmpdir()}/`), //
        async dir => rm(dir, { recursive: true, force: true }),
      )
      await Bun.build({
        ...commonConfig, //
        outdir: dir,
      })
      await Bun.spawn(
        ["bun", "run", dir, ...cli.args], //
        {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
          cwd: cli.cwd,
        },
      ).exited
    },
  }),
  defineCommand({
    path: ["transpile"],
    parser: object({
      outdir: option("--outdir", path({ mustExist: true, type: "directory" })).withDefault("./dist"),
      minify: option("--minify"),
    }),
    async handler(cli) {
      const config = { ...commonConfig, outdir: cli.outdir }
      if (!cli.minify) {
        delete config.minify
      }
      await Bun.build(config)
    },
  }),
  defineCommand({
    path: ["targets"],
    parser: object({
      format: option("--format", choice(["json", "json5", "yaml"])).withDefault("json"),
      space: option("--space", string({ pattern: /^.{0,10}$/ })).optional(),
    }),
    async handler(cli) {
      let stringify
      switch (cli.format) {
        case "json":
          stringify = JSON.stringify
          break
        case "json5":
          stringify = Bun.JSON5.stringify
          break
        case "yaml":
          stringify = Bun.YAML.stringify
          break
      }
      await Bun.stdout.write(stringify(targets, undefined, cli.space) as string)
    },
  }),
  defineCommand({
    path: ["man"],
    parser: object({
      outfile: option("--outfile", path({ allowCreate: true })).withDefault("./dist/ytmigrator.1"),
    }),
    async handler(cli) {
      await using disposer = new AsyncDisposableStack()
      const dir = disposer.adopt(
        await mkdtemp(`${tmpdir()}/`), //
        async dir => rm(dir, { recursive: true, force: true }),
      )
      await Bun.build({
        ...commonConfig,
        entrypoints: [`${import.meta.dir}/src/cli.ts`],
        outdir: dir,
      })
      await Bun.spawn(
        ["bun", "run", "--bun", "optique-man", `${dir}/cli.js`, "-s", "1", "-o", cli.outfile], //
        {
          stdin: "inherit",
          stdout: "inherit",
          stderr: "inherit",
        },
      ).exited
    },
  }),
]

await runProgram({
  commands,
  metadata: {
    name: "build.ts",
  },
  help: "command",
  completion: "command",
  showChoices: {
    maxItems: Infinity,
  },
  showDefault: true,
})
