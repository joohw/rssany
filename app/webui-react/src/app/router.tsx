import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/app/AppShell'
import { InitializePage } from '@/features/initialize/InitializePage'
import { LogsPage } from '@/features/logs/LogsPage'
import { NewPluginPage, PluginEditorPage, PluginsLayout, PluginsPage } from '@/features/plugins/PluginPages'
import { SkillPage } from '@/features/skill/SkillPage'
import { SourcesPage } from '@/features/sources/SourcesPage'
import {
  DeliverPage,
  LlmPage,
  PipelinePage,
  ProxyPage,
  SettingsLayout,
  TagsPage,
} from '@/features/settings/SettingsPages'
import { UpdateSettingsPage } from '@/features/settings/UpdateSettingsPage'

export const router = createBrowserRouter([
  {
    element: <AppShell />,
    children: [
      { path: '/', element: <SourcesPage /> },
      { path: '/logs', element: <LogsPage /> },
      {
        path: '/plugins',
        element: <PluginsLayout />,
        children: [
          { index: true, element: <PluginsPage /> },
          { path: 'new', element: <NewPluginPage /> },
          { path: ':id', element: <PluginEditorPage /> },
        ],
      },
      { path: '/skill', element: <SkillPage /> },
      {
        path: '/admin',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="/admin/update" replace /> },
          { path: 'update', element: <UpdateSettingsPage /> },
          { path: 'tags', element: <TagsPage /> },
          { path: 'pipeline', element: <PipelinePage /> },
          { path: 'llm', element: <LlmPage /> },
          { path: 'proxy', element: <ProxyPage /> },
          { path: 'deliver', element: <DeliverPage /> },
          { path: 'logs', element: <Navigate to="/logs" replace /> },
          { path: 'sources', element: <Navigate to="/" replace /> },
        ],
      },
      { path: '/init', element: <InitializePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
