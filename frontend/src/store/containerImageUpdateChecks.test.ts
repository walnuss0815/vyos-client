import { beforeEach, describe, expect, it } from 'vitest'
import type { ContainerImageUpdateCheck } from '../lib/vyosApi'
import { useContainerImageUpdateChecksStore } from './containerImageUpdateChecks'

const UPDATE_AVAILABLE: ContainerImageUpdateCheck = {
  enabled: true,
  currentTag: '1.25.3',
  recognized: true,
  latestTag: '1.26.0',
  updateAvailable: true,
  newImageRef: 'nginx:1.26.0',
}

beforeEach(() => {
  localStorage.clear()
  useContainerImageUpdateChecksStore.setState({ checks: {} })
})

describe('useContainerImageUpdateChecksStore', () => {
  it('starts with no cached checks', () => {
    expect(useContainerImageUpdateChecksStore.getState().checks).toEqual({})
  })

  it('records a check result, keyed by container name, with a timestamp', () => {
    const before = Date.now()
    useContainerImageUpdateChecksStore.getState().setCheck('web', 'nginx:1.25.3', UPDATE_AVAILABLE)
    const after = Date.now()

    const { checks } = useContainerImageUpdateChecksStore.getState()
    expect(checks.web.result).toEqual(UPDATE_AVAILABLE)
    expect(checks.web.image).toBe('nginx:1.25.3')
    expect(checks.web.checkedAt).toBeGreaterThanOrEqual(before)
    expect(checks.web.checkedAt).toBeLessThanOrEqual(after)
  })

  it('keeps separate containers independent', () => {
    useContainerImageUpdateChecksStore.getState().setCheck('web', 'nginx:1.25.3', UPDATE_AVAILABLE)
    useContainerImageUpdateChecksStore.getState().setCheck('db', 'postgres:16.1', { ...UPDATE_AVAILABLE, updateAvailable: false })

    const { checks } = useContainerImageUpdateChecksStore.getState()
    expect(Object.keys(checks).sort()).toEqual(['db', 'web'])
    expect(checks.web.result.updateAvailable).toBe(true)
    expect(checks.db.result.updateAvailable).toBe(false)
  })

  it('overwrites a previous entry for the same container', () => {
    useContainerImageUpdateChecksStore.getState().setCheck('web', 'nginx:1.25.3', UPDATE_AVAILABLE)
    useContainerImageUpdateChecksStore.getState().setCheck('web', 'nginx:1.26.0', { ...UPDATE_AVAILABLE, updateAvailable: false })

    const { checks } = useContainerImageUpdateChecksStore.getState()
    expect(Object.keys(checks)).toEqual(['web'])
    expect(checks.web.image).toBe('nginx:1.26.0')
    expect(checks.web.result.updateAvailable).toBe(false)
  })

  it('clears a cached entry without touching other containers', () => {
    useContainerImageUpdateChecksStore.getState().setCheck('web', 'nginx:1.25.3', UPDATE_AVAILABLE)
    useContainerImageUpdateChecksStore.getState().setCheck('db', 'postgres:16.1', UPDATE_AVAILABLE)

    useContainerImageUpdateChecksStore.getState().clearCheck('web')

    const { checks } = useContainerImageUpdateChecksStore.getState()
    expect(Object.keys(checks)).toEqual(['db'])
  })

  it('persists to localStorage', () => {
    useContainerImageUpdateChecksStore.getState().setCheck('web', 'nginx:1.25.3', UPDATE_AVAILABLE)

    const raw = localStorage.getItem('vyos-client-container-image-update-checks')
    expect(raw).toBeTruthy()
    expect(raw).toContain('"web"')
    expect(raw).toContain('"nginx:1.25.3"')
  })
})
