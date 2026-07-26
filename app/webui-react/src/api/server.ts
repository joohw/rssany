import { api } from '@/api/client'

export interface InitializationState {
  initialized: boolean
}

export interface UpdateSettings {
  autoUpdate: boolean
  autoRestart: boolean
}

export interface UpdateStatus {
  currentVersion: string
  latestVersion: string | null
  updateAvailable: boolean
  managed: boolean
}

export const getInitialization = () => api<InitializationState>('/api/initialization')
export const completeInitialization = () => api<{ ok: boolean }>('/api/initialization', { method: 'POST' })
export const getUpdateSettings = () => api<UpdateSettings>('/api/update-settings')
export const getUpdateStatus = () => api<UpdateStatus>('/api/update-status')
export const saveUpdateSettings = (settings: UpdateSettings) => api<UpdateSettings & { ok: boolean }>('/api/update-settings', {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(settings),
})
