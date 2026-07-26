import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import '@/styles/globals.css'
import { router } from '@/app/router'

createRoot(document.getElementById('root')!).render(
  <RouterProvider router={router} />,
)
