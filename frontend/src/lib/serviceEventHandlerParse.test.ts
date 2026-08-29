import { describe, expect, it } from 'vitest'
import {
  eventHandlerEnvironmentPath,
  eventHandlerEventPath,
  eventHandlerPath,
  parseEventHandlerConfig,
} from './serviceEventHandlerParse'

describe('parseEventHandlerConfig', () => {
  it('returns a blank, disabled config when absent', () => {
    expect(parseEventHandlerConfig(undefined).enabled).toBe(false)
  })

  it('marks enabled when the node is present, even if empty', () => {
    expect(parseEventHandlerConfig({}).enabled).toBe(true)
  })

  it('parses an event with filter, script, and environment', () => {
    const handler = {
      event: {
        'link-down': {
          filter: { pattern: 'eth0.*down', 'syslog-identifier': 'kernel' },
          script: {
            path: '/config/scripts/notify.sh',
            arguments: '--verbose',
            environment: { LEVEL: { value: 'critical' } },
          },
        },
      },
    }
    const config = parseEventHandlerConfig(handler)
    expect(config.events).toEqual([
      {
        name: 'link-down',
        filterPattern: 'eth0.*down',
        filterSyslogIdentifier: 'kernel',
        scriptPath: '/config/scripts/notify.sh',
        scriptArguments: '--verbose',
        environment: [{ name: 'LEVEL', value: 'critical' }],
      },
    ])
  })

  it('sorts events by name', () => {
    const handler = { event: { zeta: {}, alpha: {} } }
    const config = parseEventHandlerConfig(handler)
    expect(config.events.map((e) => e.name)).toEqual(['alpha', 'zeta'])
  })
})

describe('path builders', () => {
  it('builds base, event, and environment paths', () => {
    expect(eventHandlerPath('event')).toEqual(['service', 'event-handler', 'event'])
    expect(eventHandlerEventPath('link-down', 'script', 'path')).toEqual([
      'service',
      'event-handler',
      'event',
      'link-down',
      'script',
      'path',
    ])
    expect(eventHandlerEnvironmentPath('link-down')).toEqual([
      'service',
      'event-handler',
      'event',
      'link-down',
      'script',
      'environment',
    ])
  })
})
