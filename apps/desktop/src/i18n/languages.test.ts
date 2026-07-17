import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, isLocale, isSupportedLocaleValue, localeConfigValue, normalizeLocale } from './languages'

describe('desktop i18n languages', () => {
  it('normalizes supported locale aliases', () => {
    expect(normalizeLocale('en')).toBe('zh')
    expect(normalizeLocale('EN-US')).toBe('zh')
    expect(normalizeLocale('zh')).toBe('zh')
    expect(normalizeLocale('zh-CN')).toBe('zh')
    expect(normalizeLocale('zh-Hans')).toBe('zh')
    expect(normalizeLocale(' zh_hans_cn ')).toBe('zh')
    expect(normalizeLocale('zh-Hant')).toBe('zh')
    expect(normalizeLocale('ja-JP')).toBe('zh')
  })

  it('falls back to English for empty or unsupported values', () => {
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale('')).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale('de')).toBe(DEFAULT_LOCALE)
  })

  it('distinguishes exact locale ids from supported config aliases', () => {
    expect(isSupportedLocaleValue('zh-CN')).toBe(true)
    expect(isSupportedLocaleValue('zh-TW')).toBe(false)
    expect(isSupportedLocaleValue('ja-JP')).toBe(false)
    expect(isSupportedLocaleValue('de')).toBe(false)
    expect(isLocale('zh-CN')).toBe(false)
    expect(isLocale('zh')).toBe(true)
    expect(isLocale('zh-hant')).toBe(false)
    expect(isLocale('ja')).toBe(false)
  })

  it('returns the persisted config value for supported locales', () => {
    expect(localeConfigValue('en')).toBe('zh')
    expect(localeConfigValue('zh')).toBe('zh')
    expect(localeConfigValue('zh-hant')).toBe('zh')
    expect(localeConfigValue('ja')).toBe('zh')
  })
})
