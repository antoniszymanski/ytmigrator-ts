// SPDX-FileCopyrightText: 2026 Antoni Szymański
// SPDX-FileCopyrightText: 2025 The FreeTube Authors
// SPDX-License-Identifier: MPL-2.0

// https://github.com/FreeTubeApp/FreeTube/blob/891f6243775d8c58a6b1bb2d1b95c42397b2af0e/src/renderer/helpers/colors.js

// oxfmt-ignore
export const colors = ["#d50000", "#c51162", "#aa00ff", "#6200ea", "#304ffe", "#2962ff", "#0091ea", "#00b8d4", "#00bfa5", "#00c853", "#64dd17", "#aeea00", "#ffd600", "#ffab00", "#ff6d00", "#dd2c00", "#f2d5cf", "#eebebe", "#f4b8e4", "#ca9ee6", "#e78284", "#ea999c", "#ef9f76", "#e5c890", "#a6d189", "#81c8be", "#99d1db", "#85c1dc", "#8caaee", "#babbf1", "#8839ef", "#d20f39", "#f5e0dc", "#f2cdcd", "#f5c2e7", "#cba6f7", "#f38ba8", "#eba0ac", "#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#89dceb", "#74c7ec", "#89b4fa", "#b4befe", "#8be9fd", "#50fa7b", "#ffb86c", "#ff79c6", "#bd93f9", "#ff5555", "#f1fa8c", "#e67e80", "#e69875", "#dbbc7f", "#a7c080", "#83c092", "#7fbbb3", "#d699b6", "#d83532", "#d55d0f", "#a96e00", "#6d8100", "#25976c", "#2a84b5", "#cf59aa", "#b8bb26", "#fabd2f", "#83a593", "#d3869b", "#8ec07c", "#fe8019", "#9d0006", "#076678", "#8f3f71", "#af3a03", "#b58900", "#cb4b16", "#dc322f", "#d33682", "#6c71c4", "#268bd2", "#2aa198", "#859900"]

export function getRandomColor() {
  return randomArrayItem(colors) as (typeof colors)[number]
}

export function calculateColorLuminance(color: string) {
  const r = parseInt(color.substring(1, 3), 16)
  const g = parseInt(color.substring(3, 5), 16)
  const b = parseInt(color.substring(5, 7), 16)
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  if (luminance > 0.5) {
    return "#000000"
  } else {
    return "#ffffff"
  }
}

export function randomArrayItem<T>(array: T[]) {
  return array[Math.floor(Math.random() * array.length)]
}
