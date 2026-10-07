// Tên kênh IPC dùng chung giữa main và preload.
export const Channels = {
  profilesList: 'profiles:list',
  profilesCreate: 'profiles:create',
  profilesUpdate: 'profiles:update',
  profilesArchive: 'profiles:archive',
  profilesRestore: 'profiles:restore',
  profilesPurge: 'profiles:purge',
  profilesStart: 'profiles:start',
  profilesStop: 'profiles:stop',
  groupsList: 'groups:list',
  groupsCreate: 'groups:create',
  groupsRename: 'groups:rename',
  groupsRemove: 'groups:remove',
  tagsList: 'tags:list',
  kernelsList: 'kernels:list',
  kernelsInstall: 'kernels:install',
  proxiesList: 'proxies:list',
  proxiesCreate: 'proxies:create',
  proxiesUpdate: 'proxies:update',
  proxiesRemove: 'proxies:remove',
  proxiesTest: 'proxies:test',
  proxiesTestMany: 'proxies:test-many',
  proxiesImport: 'proxies:import',
  proxiesRefreshIp: 'proxies:refresh-ip',
  geoStatus: 'geo:status',
  geoInstall: 'geo:install',
  // main → renderer
  evtProfileStatus: 'evt:profile-status',
  evtKernelProgress: 'evt:kernel-progress',
  evtGeoProgress: 'evt:geo-progress'
} as const

export type { Result } from '../../shared/types'
