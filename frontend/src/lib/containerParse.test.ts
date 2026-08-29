import { describe, expect, it } from 'vitest'
import {
  containerDevicePath,
  containerEnvironmentPath,
  containerHealthCheckPath,
  containerLabelPath,
  containerNamePath,
  containerNetworkAttachmentPath,
  containerNetworkPath,
  containerPath,
  containerPortPath,
  containerRegistryPath,
  containerSysctlPath,
  containerTmpfsPath,
  containerVolumePath,
  parseContainerConfig,
  parseContainerNetworks,
  parseContainerRegistries,
  parseContainers,
} from './containerParse'

describe('parseContainerConfig', () => {
  it('returns blank lists when container is absent', () => {
    const config = parseContainerConfig(undefined)
    expect(config).toEqual({ containers: [], networks: [], registries: [] })
  })
})

describe('parseContainers', () => {
  it('parses a minimal container definition', () => {
    const container = { name: { web: { image: 'nginx:latest' } } }
    const containers = parseContainers(container)
    expect(containers).toHaveLength(1)
    expect(containers[0]).toMatchObject({ name: 'web', image: 'nginx:latest', disabled: false })
  })

  it('parses scalar fields', () => {
    const container = {
      name: {
        web: {
          image: 'nginx:latest',
          description: 'Web server',
          entrypoint: '/bin/sh',
          command: 'nginx',
          arguments: '-g daemon off;',
          'host-name': 'web-host',
          restart: 'always',
          'cpu-quota': '1.5',
          memory: '256',
          'shared-memory': '32',
          uid: '1000',
          gid: '1000',
          'log-driver': 'journald',
        },
      },
    }
    const [c] = parseContainers(container)
    expect(c).toMatchObject({
      image: 'nginx:latest',
      description: 'Web server',
      entrypoint: '/bin/sh',
      command: 'nginx',
      arguments: '-g daemon off;',
      hostName: 'web-host',
      restart: 'always',
      cpuQuota: '1.5',
      memory: '256',
      sharedMemory: '32',
      uid: '1000',
      gid: '1000',
      logDriver: 'journald',
    })
  })

  it('parses boolean flags', () => {
    const container = {
      name: {
        web: {
          disable: {},
          'allow-host-pid': {},
          'allow-host-networks': {},
          privileged: {},
        },
      },
    }
    const [c] = parseContainers(container)
    expect(c).toMatchObject({
      disabled: true,
      allowHostPid: true,
      allowHostNetworks: true,
      privileged: true,
    })
  })

  it('parses multi-valued capability and name-server leaves', () => {
    const container = {
      name: {
        web: {
          capability: ['net-admin', 'sys-time'],
          'name-server': '8.8.8.8',
        },
      },
    }
    const [c] = parseContainers(container)
    expect(c.capabilities).toEqual(['net-admin', 'sys-time'])
    expect(c.nameServers).toEqual(['8.8.8.8'])
  })

  it('parses sysctl parameters', () => {
    const container = {
      name: { web: { sysctl: { parameter: { 'net.core.somaxconn': { value: '1024' } } } } },
    }
    const [c] = parseContainers(container)
    expect(c.sysctl).toEqual([{ parameter: 'net.core.somaxconn', value: '1024' }])
  })

  it('parses devices', () => {
    const container = {
      name: { web: { device: { dev0: { source: '/dev/net/tun', destination: '/dev/net/tun' } } } },
    }
    const [c] = parseContainers(container)
    expect(c.devices).toEqual([{ id: 'dev0', source: '/dev/net/tun', destination: '/dev/net/tun' }])
  })

  it('parses environment variables', () => {
    const container = { name: { web: { environment: { TZ: { value: 'UTC' } } } } }
    const [c] = parseContainers(container)
    expect(c.environment).toEqual([{ name: 'TZ', value: 'UTC' }])
  })

  it('parses labels', () => {
    const container = { name: { web: { label: { env: { value: 'prod' } } } } }
    const [c] = parseContainers(container)
    expect(c.labels).toEqual([{ name: 'env', value: 'prod' }])
  })

  it('parses network attachments with multi-valued address and mac', () => {
    const container = {
      name: {
        web: {
          network: { NET01: { address: ['192.0.2.5'], mac: '00:11:22:33:44:55' } },
        },
      },
    }
    const [c] = parseContainers(container)
    expect(c.networks).toEqual([
      { networkName: 'NET01', addresses: ['192.0.2.5'], mac: '00:11:22:33:44:55' },
    ])
  })

  it('parses port mappings', () => {
    const container = {
      name: {
        web: {
          port: {
            http: {
              'listen-address': ['192.0.2.1'],
              source: '8080',
              destination: '80',
              protocol: 'tcp',
            },
          },
        },
      },
    }
    const [c] = parseContainers(container)
    expect(c.ports).toEqual([
      { id: 'http', listenAddresses: ['192.0.2.1'], source: '8080', destination: '80', protocol: 'tcp' },
    ])
  })

  it('parses tmpfs mounts', () => {
    const container = { name: { web: { tmpfs: { t0: { destination: '/tmp', size: '64' } } } } }
    const [c] = parseContainers(container)
    expect(c.tmpfs).toEqual([{ id: 't0', destination: '/tmp', size: '64' }])
  })

  it('parses volume mounts', () => {
    const container = {
      name: {
        web: {
          volume: {
            data: { source: '/mnt/data', destination: '/data', mode: 'ro', propagation: 'rslave' },
          },
        },
      },
    }
    const [c] = parseContainers(container)
    expect(c.volumes).toEqual([
      { id: 'data', source: '/mnt/data', destination: '/data', mode: 'ro', propagation: 'rslave' },
    ])
  })

  it('parses health-check', () => {
    const container = {
      name: {
        web: {
          'health-check': { command: 'curl -f http://localhost/', interval: '30', timeout: '5', retry: '3' },
        },
      },
    }
    const [c] = parseContainers(container)
    expect(c.healthCheck).toEqual({
      command: 'curl -f http://localhost/',
      interval: '30',
      timeout: '5',
      retry: '3',
    })
  })

  it('returns a blank health-check when absent', () => {
    const container = { name: { web: {} } }
    const [c] = parseContainers(container)
    expect(c.healthCheck).toEqual({})
  })

  it('sorts containers by name', () => {
    const container = { name: { web: {}, api: {}, db: {} } }
    const containers = parseContainers(container)
    expect(containers.map((c) => c.name)).toEqual(['api', 'db', 'web'])
  })
})

describe('parseContainerNetworks', () => {
  it('parses a bridge network', () => {
    const container = {
      network: {
        NET01: {
          description: 'Container LAN',
          mtu: '1500',
          gateway: ['192.0.2.1'],
          prefix: ['192.0.2.0/24'],
          'no-name-server': {},
          type: { bridge: {} },
        },
      },
    }
    const [n] = parseContainerNetworks(container)
    expect(n).toMatchObject({
      name: 'NET01',
      description: 'Container LAN',
      mtu: '1500',
      gateways: ['192.0.2.1'],
      prefixes: ['192.0.2.0/24'],
      noNameServer: true,
      type: 'bridge',
    })
  })

  it('parses a macvlan network', () => {
    const container = {
      network: {
        NET01: { type: { macvlan: { mode: 'bridge', parent: 'eth0' } } },
      },
    }
    const [n] = parseContainerNetworks(container)
    expect(n.type).toBe('macvlan')
    expect(n.macvlan).toEqual({ mode: 'bridge', parent: 'eth0' })
  })

  it('parses vrf', () => {
    const container = { network: { NET01: { vrf: 'RED' } } }
    const [n] = parseContainerNetworks(container)
    expect(n.vrf).toBe('RED')
  })

  it('leaves type undefined when unset', () => {
    const container = { network: { NET01: {} } }
    const [n] = parseContainerNetworks(container)
    expect(n.type).toBeUndefined()
  })
})

describe('parseContainerRegistries', () => {
  it('parses username and hasPassword without leaking the password value', () => {
    const container = {
      registry: {
        'docker.io': { authentication: { username: 'alice', password: 'super-secret' } },
      },
    }
    const [r] = parseContainerRegistries(container)
    expect(r.username).toBe('alice')
    expect(r.hasPassword).toBe(true)
    expect(JSON.stringify(r)).not.toContain('super-secret')
  })

  it('parses disable and insecure flags', () => {
    const container = { registry: { mirror1: { disable: {}, insecure: {} } } }
    const [r] = parseContainerRegistries(container)
    expect(r.disabled).toBe(true)
    expect(r.insecure).toBe(true)
  })

  it('parses mirror settings', () => {
    const container = {
      registry: {
        mirror1: { mirror: { address: '192.0.2.10', 'host-name': 'mirror.example.com', port: '5000', path: '/v2' } },
      },
    }
    const [r] = parseContainerRegistries(container)
    expect(r.mirror).toEqual({
      address: '192.0.2.10',
      hostName: 'mirror.example.com',
      port: '5000',
      path: '/v2',
    })
  })

  it('leaves mirror undefined when unset', () => {
    const container = { registry: { 'docker.io': {} } }
    const [r] = parseContainerRegistries(container)
    expect(r.mirror).toBeUndefined()
  })
})

describe('path builders', () => {
  it('builds a container base path', () => {
    expect(containerPath('name')).toEqual(['container', 'name'])
  })

  it('builds a container name path', () => {
    expect(containerNamePath('web', 'image')).toEqual(['container', 'name', 'web', 'image'])
  })

  it('builds a sysctl parameter path', () => {
    expect(containerSysctlPath('web', 'net.core.somaxconn', 'value')).toEqual([
      'container',
      'name',
      'web',
      'sysctl',
      'parameter',
      'net.core.somaxconn',
      'value',
    ])
  })

  it('builds a device path', () => {
    expect(containerDevicePath('web', 'dev0', 'source')).toEqual([
      'container',
      'name',
      'web',
      'device',
      'dev0',
      'source',
    ])
  })

  it('builds an environment path', () => {
    expect(containerEnvironmentPath('web', 'TZ', 'value')).toEqual([
      'container',
      'name',
      'web',
      'environment',
      'TZ',
      'value',
    ])
  })

  it('builds a label path', () => {
    expect(containerLabelPath('web', 'env', 'value')).toEqual([
      'container',
      'name',
      'web',
      'label',
      'env',
      'value',
    ])
  })

  it('builds a network attachment path', () => {
    expect(containerNetworkAttachmentPath('web', 'NET01', 'mac')).toEqual([
      'container',
      'name',
      'web',
      'network',
      'NET01',
      'mac',
    ])
  })

  it('builds a port path', () => {
    expect(containerPortPath('web', 'http', 'destination')).toEqual([
      'container',
      'name',
      'web',
      'port',
      'http',
      'destination',
    ])
  })

  it('builds a tmpfs path', () => {
    expect(containerTmpfsPath('web', 't0', 'size')).toEqual([
      'container',
      'name',
      'web',
      'tmpfs',
      't0',
      'size',
    ])
  })

  it('builds a volume path', () => {
    expect(containerVolumePath('web', 'data', 'mode')).toEqual([
      'container',
      'name',
      'web',
      'volume',
      'data',
      'mode',
    ])
  })

  it('builds a health-check path', () => {
    expect(containerHealthCheckPath('web', 'command')).toEqual([
      'container',
      'name',
      'web',
      'health-check',
      'command',
    ])
  })

  it('builds a container network path', () => {
    expect(containerNetworkPath('NET01', 'gateway')).toEqual(['container', 'network', 'NET01', 'gateway'])
  })

  it('builds a container registry path', () => {
    expect(containerRegistryPath('docker.io', 'insecure')).toEqual([
      'container',
      'registry',
      'docker.io',
      'insecure',
    ])
  })
})
