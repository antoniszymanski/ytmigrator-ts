// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-License-Identifier: MPL-2.0

import { deepEquals } from "bun"
import type { Playlists } from "../remotes"

type PlaylistChange =
  | {
      type: "CREATE_PLAYLIST"
      name: string
      videos: string[]
    }
  | {
      type: "RENAME_PLAYLIST"
      oldName: string
      newName: string
    }
  | {
      type: "DELETE_PLAYLIST"
      name: string
    }
  | {
      type: "INSERT_VIDEO"
      playlistName: string
      index: number
      value: string
    }
  | {
      type: "REMOVE_VIDEO"
      playlistName: string
      index: number
      value: string
    }

export function nextPlaylistChange(source: Playlists, target: Playlists): PlaylistChange | undefined {
  for (const [sourceName, sourceVideos] of source) {
    let bestMatch
    for (const [targetName, targetVideos] of target) {
      if (sourceName === targetName) {
        continue
      }
      const distance = calculateEditDistance(sourceVideos, targetVideos)
      if (distance === 0) {
        return { type: "RENAME_PLAYLIST", oldName: sourceName, newName: targetName }
      }
      if (!bestMatch || distance < bestMatch.distance) {
        bestMatch = { name: targetName, distance, targetVideos }
      }
    }
    if (bestMatch && bestMatch.distance < 1) {
      return { type: "RENAME_PLAYLIST", oldName: sourceName, newName: bestMatch.name }
    }
  }
  for (const name of source.keys()) {
    if (!target.has(name)) {
      return { type: "DELETE_PLAYLIST", name }
    }
  }
  for (const [name, videos] of target) {
    if (!source.has(name)) {
      return { type: "CREATE_PLAYLIST", name, videos }
    }
  }
  for (const [name, sourceVideos] of source) {
    const targetVideos = target.get(name)
    if (!targetVideos) {
      continue
    }
    const change = nextArrayChange(sourceVideos, targetVideos)
    if (change) {
      return {
        type: `${change.type}_VIDEO`,
        playlistName: name,
        index: change.index,
        value: change.value,
      }
    }
  }
}

function calculateEditDistance(source: string[], target: string[]): number {
  let changes = 0
  while (true) {
    const change = nextArrayChange(source, target)
    if (!change) {
      break
    } else if (changes === 0) {
      source = [...source]
    }
    changes++
    switch (change.type) {
      case "INSERT":
        source.splice(change.index, 0, change.value)
        break
      case "REMOVE":
        source.splice(change.index, 1)
        break
    }
  }
  return changes / (1 + target.length)
}

interface ArrayChange {
  type: "INSERT" | "REMOVE"
  index: number
  value: string
}

export function nextArrayChange(source: string[], target: string[]): ArrayChange | undefined {
  let index = 0
  // Only iterate while we have items in source AND target
  while (index < source.length && index < target.length) {
    if (source[index] !== target[index]) {
      // Check if it's a removal (next source item matches current target)
      if (source[index + 1] === target[index]) {
        return { type: "REMOVE", index, value: source[index]! }
      }
      return { type: "INSERT", index, value: target[index]! }
    }
    index++
  }
  // If we've exhausted source, check if there are remaining target items
  if (index < target.length) {
    return { type: "INSERT", index, value: target[index]! }
  }
  // If we've exhausted target, check if there are remaining source items
  if (index < source.length) {
    return { type: "REMOVE", index, value: source[index]! }
  }
  return undefined
}
