import { join } from 'node:path'

export const paths = {
  db: (dataRoot: string) => join(dataRoot, 'isola.db'),
  kernels: (dataRoot: string) => join(dataRoot, 'kernels'),
  logs: (dataRoot: string) => join(dataRoot, 'logs'),
  profile: (dataRoot: string, id: string) => join(dataRoot, 'profiles', id),
  userData: (dataRoot: string, id: string) => join(dataRoot, 'profiles', id, 'user-data')
}
