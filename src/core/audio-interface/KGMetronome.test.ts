import { beforeEach, describe, expect, it, vi } from 'vitest'
import { MockLoop, MockTransport } from '../../test/mocks/tone'

vi.mock('tone', async () => {
  const { ToneMock: toneMock } = await import('../../test/mocks/tone')
  return toneMock
})

import { KGMetronome } from './KGMetronome'

describe('KGMetronome', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(0)
    vi.clearAllMocks()
    MockTransport.bpm.value = 120
    MockTransport.getTicksAtTime.mockImplementation((time: number) => time * MockTransport.PPQ)
  })

  it('schedules audible preroll clicks before beat 0 and keeps the beat 0 accent', () => {
    const metronome = new KGMetronome()
    const triggerAttackRelease = vi.fn()
    ;(metronome as unknown as { sampler: unknown }).sampler = {
      loaded: true,
      triggerAttackRelease,
    }

    metronome.start(-4, 4, 0.2)

    vi.advanceTimersByTime(200)
    expect(triggerAttackRelease.mock.calls[0]?.[0]).toBe('C5')
    expect(triggerAttackRelease.mock.calls[0]?.[1]).toBe('16n')
    expect(triggerAttackRelease.mock.calls[0]?.[2]).toBeCloseTo(0.2, 5)

    vi.advanceTimersByTime(1000)
    expect(triggerAttackRelease.mock.calls[1]?.[0]).toBe('C4')
    expect(triggerAttackRelease.mock.calls[1]?.[1]).toBe('16n')
    expect(triggerAttackRelease.mock.calls[1]?.[2]).toBeCloseTo(0.7, 5)

    const transportLoop = MockLoop.mock.results[0]?.value
    expect(transportLoop).toBeDefined()

    transportLoop.callback(0)
    expect(triggerAttackRelease).toHaveBeenLastCalledWith('C5', '16n', 0.2)
  })

  it('cancels pending preroll clicks when stopped', () => {
    const metronome = new KGMetronome()
    const triggerAttackRelease = vi.fn()
    ;(metronome as unknown as { sampler: unknown }).sampler = {
      loaded: true,
      triggerAttackRelease,
    }

    metronome.start(-2, 4, 0.2)
    metronome.stop()
    vi.runAllTimers()

    expect(triggerAttackRelease).not.toHaveBeenCalled()
  })
})
