import { createHashRouter } from 'react-router';
import { App } from './App.tsx';
import { DashboardPage } from './pages/DashboardPage.tsx';
import { SettingsPage } from './pages/SettingsPage.tsx';
import { TreePage } from './pages/TreePage.tsx';

export const router = createHashRouter([
  {
    path: '/',
    element: <App />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'tree/:treeId', element: <TreePage /> },
      { path: 'settings', element: <SettingsPage /> },
    ],
  },
]);
