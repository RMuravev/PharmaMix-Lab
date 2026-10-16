import { createRoot } from 'react-dom/client';
import WorkspaceApp from './app/WorkspaceApp';
import './index.css';

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Не найден корневой элемент #root');
createRoot(rootElement).render(<WorkspaceApp />);
