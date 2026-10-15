import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import WorkspaceApp from './app/WorkspaceApp';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Не найден корневой элемент #root');
const isWorkspace = window.location.pathname.replace(/\/$/, '') === '/workspace';
createRoot(rootElement).render(isWorkspace ? <WorkspaceApp /> : <App />);
