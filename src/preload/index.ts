import { contextBridge, ipcRenderer, type IpcRendererEvent } from 'electron'
import { Channels } from '../main/ipc/channels'
import type { IsolaApi } from '../shared/types'

const invoke = (channel: string, ...args: unknown[]) => ipcRenderer.invoke(channel, ...args)

function subscribe<T>(channel: string, cb: (e: T) => void): () => void {
  const listener = (_: IpcRendererEvent, payload: T) => cb(payload)
  ipcRenderer.on(channel, listener)
  return () => ipcRenderer.removeListener(channel, listener)
}

// Renderer chỉ chạm main qua object này. Không có hàm nào đọc password ra.
const api: IsolaApi = {
  profiles: {
    list: (filter) => invoke(Channels.profilesList, filter),
    create: (input) => invoke(Channels.profilesCreate, input),
    update: (id, patch) => invoke(Channels.profilesUpdate, id, patch),
    archive: (id) => invoke(Channels.profilesArchive, id),
    restore: (id) => invoke(Channels.profilesRestore, id),
    purge: (id, confirmed) => invoke(Channels.profilesPurge, id, confirmed),
    start: (id) => invoke(Channels.profilesStart, id),
    stop: (id) => invoke(Channels.profilesStop, id)
  },
  groups: {
    list: () => invoke(Channels.groupsList),
    create: (name) => invoke(Channels.groupsCreate, name),
    rename: (id, name) => invoke(Channels.groupsRename, id, name),
    remove: (id) => invoke(Channels.groupsRemove, id)
  },
  tags: {
    list: () => invoke(Channels.tagsList)
  },
  kernels: {
    list: () => invoke(Channels.kernelsList),
    install: (id) => invoke(Channels.kernelsInstall, id)
  },
  proxies: {
    list: () => invoke(Channels.proxiesList),
    create: (input) => invoke(Channels.proxiesCreate, input),
    update: (id, patch) => invoke(Channels.proxiesUpdate, id, patch),
    remove: (id) => invoke(Channels.proxiesRemove, id),
    test: (id) => invoke(Channels.proxiesTest, id),
    testMany: (ids) => invoke(Channels.proxiesTestMany, ids),
    import: (text, defaultType) => invoke(Channels.proxiesImport, text, defaultType),
    refreshIp: (id) => invoke(Channels.proxiesRefreshIp, id)
  },
  geo: {
    status: () => invoke(Channels.geoStatus),
    install: () => invoke(Channels.geoInstall)
  },
  onProfileStatus: (cb) => subscribe(Channels.evtProfileStatus, cb),
  onKernelProgress: (cb) => subscribe(Channels.evtKernelProgress, cb),
  onGeoProgress: (cb) => subscribe(Channels.evtGeoProgress, cb)
}

contextBridge.exposeInMainWorld('isola', api)
