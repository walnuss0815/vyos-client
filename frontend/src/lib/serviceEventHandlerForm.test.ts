import { describe, expect, it } from 'vitest'
import {
  blankEventHandlerEventFormValues,
  deleteEventHandlerEventOp,
  disableEventHandlerOp,
  enableEventHandlerOp,
  eventHandlerEventFormToOps,
  eventHandlerEventToFormValues,
} from './serviceEventHandlerForm'
import { blankEventHandlerEvent, type EventHandlerEvent } from './serviceEventHandlerTypes'

function emptyEvent(overrides: Partial<EventHandlerEvent> = {}): EventHandlerEvent {
  return { name: 'link-down', ...blankEventHandlerEvent(), ...overrides }
}

describe('eventHandlerEventFormToOps - creating', () => {
  it('always sets the event tag itself, even with a blank form', () => {
    expect(eventHandlerEventFormToOps('link-down', undefined, blankEventHandlerEventFormValues())).toEqual([
      { op: 'set', path: ['service', 'event-handler', 'event', 'link-down'] },
    ])
  })

  it('queues filter and script fields', () => {
    const values = blankEventHandlerEventFormValues()
    values.filterPattern = 'eth0.*down'
    values.scriptPath = '/config/scripts/notify.sh'

    expect(eventHandlerEventFormToOps('link-down', undefined, values)).toEqual([
      { op: 'set', path: ['service', 'event-handler', 'event', 'link-down'] },
      {
        op: 'set',
        path: ['service', 'event-handler', 'event', 'link-down', 'filter', 'pattern'],
        value: 'eth0.*down',
      },
      {
        op: 'set',
        path: ['service', 'event-handler', 'event', 'link-down', 'script', 'path'],
        value: '/config/scripts/notify.sh',
      },
    ])
  })
})

describe('eventHandlerEventFormToOps - editing', () => {
  it('queues nothing when unchanged (no base set re-issued)', () => {
    const event = emptyEvent({ scriptPath: '/config/scripts/notify.sh' })
    expect(eventHandlerEventFormToOps('link-down', event, eventHandlerEventToFormValues(event))).toEqual([])
  })
})

describe('deleteEventHandlerEventOp', () => {
  it('builds a delete op', () => {
    expect(deleteEventHandlerEventOp('link-down')).toEqual({
      op: 'delete',
      path: ['service', 'event-handler', 'event', 'link-down'],
    })
  })
})

describe('enableEventHandlerOp / disableEventHandlerOp', () => {
  it('builds the expected ops', () => {
    expect(enableEventHandlerOp()).toEqual({ op: 'set', path: ['service', 'event-handler'] })
    expect(disableEventHandlerOp()).toEqual({ op: 'delete', path: ['service', 'event-handler'] })
  })
})
