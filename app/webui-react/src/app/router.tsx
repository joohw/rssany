import { createBrowserRouter, Navigate } from 'react-router'
import { AppShell } from '@/app/AppShell'
import { InitializePage } from '@/features/initialize/InitializePage'
import { LogsPage } from '@/features/logs/LogsPage'
import { CollectorEditorPage, CollectorsLayout, CollectorsPage, NewCollectorPage } from '@/features/collectors/CollectorPages'
import { PipelinePage } from '@/features/pipeline/PipelinePage'
import { SkillPage } from '@/features/skill/SkillPage'
import { SourcesPage } from '@/features/sources/SourcesPage'
import {
  BackupPage,
  DeliverPage,
  LlmPage,
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
        path: '/collectors',
        element: <CollectorsLayout />,
        children: [
          { index: true, element: <CollectorsPage /> },
          { path: 'new', element: <NewCollectorPage /> },
          { path: ':id', element: <CollectorEditorPage /> },
        ],
      },
      { path: '/pipeline', element: <PipelinePage /> },
      { path: '/skill', element: <SkillPage /> },
      {
        path: '/admin',
        element: <SettingsLayout />,
        children: [
          { index: true, element: <Navigate to="/admin/update" replace /> },
          { path: 'update', element: <UpdateSettingsPage /> },
          { path: 'tags', element: <TagsPage /> },
          { path: 'pipeline', element: <Navigate to="/pipeline" replace /> },
          { path: 'llm', element: <LlmPage /> },
          { path: 'proxy', element: <ProxyPage /> },
          { path: 'deliver', element: <DeliverPage /> },
          { path: 'backup', element: <BackupPage /> },
          { path: 'logs', element: <Navigate to="/logs" replace /> },
          { path: 'sources', element: <Navigate to="/" replace /> },
        ],
      },
      { path: '/init', element: <InitializePage /> },
      { path: '*', element: <Navigate to="/" replace /> },
    ],
  },
])
