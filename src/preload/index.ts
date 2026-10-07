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
  onProfileStatus: (cb) => subscribe(Channels.evtProfileStatus, cb),
  onKernelProgress: (cb) => subscribe(Channels.evtKernelProgress, cb)
}

contextBridge.exposeInMainWorld('isola', api)
