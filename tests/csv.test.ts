import { describe, expect, it } from 'vitest'
import { parseBool, parseCsv, splitMulti } from '../src/main/engine/csv'

describe('parseCsv', () => {
  it('đọc header + dòng, trim, bỏ dòng trống, BOM', () => {
    const rows = parseCsv('﻿Name, Group\r\nAcc 1, Shop\r\n\r\nAcc 2,\n')
    expect(rows).toEqual([
      { name: 'Acc 1', group: 'Shop' },
      { name: 'Acc 2', group: '' }
    ])
  })

  it('ô có dấu phẩy và xuống dòng trong "..."; "" là nháy escape', () => {
    const rows = parseCsv('name,notes\n"A, B","dòng 1\ndòng 2"\n"có ""nháy""",x')
    expect(rows[0]).toEqual({ name: 'A, B', notes: 'dòng 1\ndòng 2' })
    expect(rows[1]).toEqual({ name: 'có "nháy"', notes: 'x' })
  })

  it('splitMulti tách ; | xuống dòng; parseBool', () => {
    expect(splitMulti('a; b|c\nd')).toEqual(['a', 'b', 'c', 'd'])
    expect([parseBool('true'), parseBool('1'), parseBool('x'), parseBool('có'), parseBool('no')]).toEqual([
      true,
      true,
      true,
      true,
      false
    ])
  })
})
