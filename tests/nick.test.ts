import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import { BLOCKED_WORDS, nickProblem, normalizeNick } from '../src/lib/nick'

describe('nik', () => {
  it('pravila dužine i znakova', () => {
    expect(nickProblem('ab')).toMatch(/bar 3/)
    expect(nickProblem('a'.repeat(21))).toMatch(/20/)
    expect(nickProblem('ana b')).toMatch(/slova/)
    expect(nickProblem('Kaća_99')).toBeNull()
  })
  it('filter riječi (i leetspeak)', () => {
    expect(nickProblem('f.u.c.k')).not.toBeNull()
    expect(nickProblem('kur4c')).not.toBeNull()
    expect(nickProblem('luna.k')).toBeNull()
  })
  it('normalizacija', () => {
    expect(normalizeNick('ĐuroČ')).toBe('djuroc')
  })
  it('SQL i TS imaju isti spisak zabranjenih riječi', () => {
    const sql = readFileSync(new URL('../supabase/migrations/0001_schema.sql', import.meta.url), 'utf8')
    const m = sql.match(/blocked text\[\] := array\[([\s\S]*?)\];/)
    const words = [...m![1].matchAll(/'([^']+)'/g)].map((x) => x[1])
    expect(words).toEqual(BLOCKED_WORDS)
  })
})
