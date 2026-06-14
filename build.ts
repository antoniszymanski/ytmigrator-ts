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
  command(
    "man",
    object({
      action: constant("man"),
      outfile: withDefault(option("--outfile", path({ allowCreate: true })), "./dist/ytmigrator.1"),
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

type Cli<Action extends (typeof cli)["action"]> = typeof cli & { readonly action: Action }

async function main() {
  switch (cli.action) {
    case "build":
      await buildCommand(cli)
      break
    case "run":
      await runCommand(cli)
      break
    case "transpile":
      await transpileCommand(cli)
      break
    case "targets":
      await targetsCommand(cli)
      break
    case "man":
      await manCommand(cli)
      break
  }
}
main()

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
  define: {
    BUILD_NAME: JSON.stringify("ytmigrator"),
    BUILD_VERSION: JSON.stringify((await $`git describe --tags --always`.text()).trim()),
  },
}

async function buildCommand(cli: Cli<"build">) {
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
}

async function runCommand(cli: Cli<"run">) {
  await using disposer = new AsyncDisposableStack()
  const dir = disposer.adopt(
    await mkdtemp(`${tmpdir()}/`), //
    dir => rm(dir, { recursive: true, force: true }),
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
}

async function transpileCommand(cli: Cli<"transpile">) {
  const config = { ...commonConfig, outdir: cli.outdir }
  if (!cli.minify) {
    delete config.minify
  }
  await Bun.build(config)
}

async function targetsCommand(cli: Cli<"targets">) {
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
}

async function manCommand(cli: Cli<"man">) {
  await using disposer = new AsyncDisposableStack()
  const dir = disposer.adopt(
    await mkdtemp(`${tmpdir()}/`), //
    dir => rm(dir, { recursive: true, force: true }),
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
}
