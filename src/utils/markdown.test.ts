import { describe, expect, test } from 'bun:test'
import stripAnsi from 'strip-ansi'

import { stringWidth } from '../ink/stringWidth.js'
import { applyMarkdown } from './markdown.js'

function displayOffsetBefore(line: string, anchor: string): number {
  const index = line.indexOf(anchor)
  if (index < 0) {
    throw new Error(`Missing anchor ${anchor} in line: ${line}`)
  }
  return stringWidth(line.slice(0, index))
}

describe('applyMarkdown table rendering', () => {
  test('aligns later columns across CJK and ASCII rows by display width', () => {
    const markdown = [
      '| 配置 | Config | 状态 |',
      '|------|--------|------|',
      '| Vicuna (report) | dense | x |',
      '| ChatGLM | chat | ok |',
      '| 通义千问 | qwen | x |',
    ].join('\n')

    const output = stripAnsi(applyMarkdown(markdown, 'dark'))
    const lines = output
      .split('\n')
      .filter(line => line.startsWith('|') && !/^\|[-|]+\|$/.test(line))

    const headerOffset = displayOffsetBefore(lines[0]!, 'Config')
    expect(displayOffsetBefore(lines[1]!, 'dense')).toBe(headerOffset)
    expect(displayOffsetBefore(lines[2]!, 'chat')).toBe(headerOffset)
    expect(displayOffsetBefore(lines[3]!, 'qwen')).toBe(headerOffset)
  })

  test('renders too-wide tables as vertical key value rows', () => {
    const markdown = [
      '| Item | Description | Notes |',
      '|------|-------------|-------|',
      '| a | short | ok |',
      '| b | this is a much longer description that would force terminal wrapping in a narrow panel | fine |',
      '| c | tiny | - |',
    ].join('\n')

    const output = stripAnsi(applyMarkdown(markdown, 'dark', null, { maxTableWidth: 60 }))

    expect(output).not.toContain('|')
    expect(output).toContain('Item: a')
    expect(output).toContain('Description: short')
    expect(output).toContain('Notes: ok')
    expect(output).toContain('----------------------------------------')
    for (const line of output.split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(60)
    }
  })

  test('keeps horizontal rendering when table fits width budget', () => {
    const markdown = [
      '| Name | Age |',
      '|------|-----|',
      '| Ada | 36 |',
      '| Lin | 42 |',
    ].join('\n')

    const output = stripAnsi(applyMarkdown(markdown, 'dark', null, { maxTableWidth: 80 }))
    const lines = output
      .split('\n')
      .filter(line => line.startsWith('|') && !/^\|[-|]+\|$/.test(line))

    expect(lines.length).toBe(3)
    const ageOffset = displayOffsetBefore(lines[0]!, 'Age')
    expect(displayOffsetBefore(lines[1]!, '36')).toBe(ageOffset)
    expect(displayOffsetBefore(lines[2]!, '42')).toBe(ageOffset)
  })

  test('vertical fallback wraps CJK cells within width budget', () => {
    const markdown = [
      '| 模型 | 描述 | 备注 |',
      '|------|------|------|',
      '| 千问 | 一个相当长的描述用于把列宽撑得超过可用终端宽度从而触发竖排回退 | 通过 |',
      '| 文心 | 短 | 否 |',
    ].join('\n')

    const output = stripAnsi(applyMarkdown(markdown, 'dark', null, { maxTableWidth: 42 }))

    expect(output).not.toContain('|')
    expect(output).toContain('模型: 千问')
    expect(output).toContain('模型: 文心')
    for (const line of output.split('\n')) {
      expect(stringWidth(line)).toBeLessThanOrEqual(42)
    }
  })
})
