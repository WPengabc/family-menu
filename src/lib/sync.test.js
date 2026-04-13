import { describe, expect, it } from 'vitest'
import { __syncInternals } from './sync'

describe('sync error classification', () => {
  it('marks auth/rls issues as fatal', () => {
    expect(__syncInternals.isFatalSyncError({ status: 401, message: 'unauthorized' })).toBe(true)
    expect(__syncInternals.isFatalSyncError({ message: 'row-level security policy violation' })).toBe(true)
  })

  it('classifies common failure types', () => {
    expect(__syncInternals.classifySyncError({ status: 503, message: 'server down' })).toContain('服务暂时不可用')
    expect(__syncInternals.classifySyncError({ message: 'network timeout' })).toContain('网络异常')
    expect(__syncInternals.classifySyncError({ code: '23505', message: 'duplicate' })).toContain('数据冲突')
  })
})
