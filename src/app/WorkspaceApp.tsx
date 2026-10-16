import { useState } from 'react';
import OverviewPage from '../pages/OverviewPage';
import VersionedSnapshotImportPage from '../pages/VersionedSnapshotImportPage';
import ActiveAnalyticsDashboardPage from '../pages/ActiveAnalyticsDashboardPage';
import ModelRunsFreshnessPage from '../pages/ModelRunsFreshnessPage';
import ScenarioResultsPage from '../pages/ScenarioResultsPage';
import TemporalMmmComparisonPage from '../pages/TemporalMmmComparisonPage';
import CausalLiftPage from '../pages/CausalLiftPage';
import CausalMmmReconciliationPage from '../pages/CausalMmmReconciliationPage';
import ModelTournamentPage from '../pages/ModelTournamentPage';
import './workspace.css';

type WorkspaceRoute = 'overview' | 'analytics' | 'models' | 'scenarios' | 'snapshot-import' | 'mmm-compare' | 'model-tournament' | 'causal-lift' | 'causal-mmm';
const PROJECT_KEY = 'pharmamix.activeProjectId';
function readProject(): string {
  try { return localStorage.getItem(PROJECT_KEY) || 'default'; } catch { return 'default'; }
}

/** Current PharmaMix workspace. Legacy runtime entrypoints are intentionally unsupported. */
export default function WorkspaceApp() {
  const [route, setRoute] = useState<WorkspaceRoute>(window.location.hash === '#snapshot-import' ? 'snapshot-import' : window.location.hash === '#causal-mmm' ? 'causal-mmm' : window.location.hash === '#causal-lift' ? 'causal-lift' : window.location.hash === '#model-tournament' ? 'model-tournament' : window.location.hash === '#mmm-compare' ? 'mmm-compare' : window.location.hash === '#analytics' ? 'analytics' : window.location.hash === '#models' ? 'models' : window.location.hash === '#scenarios' ? 'scenarios' : 'overview');
  const [projectId, setProjectId] = useState(readProject);
  function navigate(next: WorkspaceRoute) {
    setRoute(next);
    window.history.replaceState(null, '', next === 'overview' ? '/workspace' : `/workspace#${next}`);
  }
  function changeProject(value: string) {
    const normalized = value.trim().slice(0, 80) || 'default';
    setProjectId(normalized);
    try { localStorage.setItem(PROJECT_KEY, normalized); } catch { /* private browsing may block storage */ }
  }
  return <div className="pm-workspace">
    <aside className="pm-workspace-sidebar">
      <a className="pm-workspace-brand" href="/workspace"><span className="pm-workspace-logo">P</span><span><strong>PharmaMix Lab</strong><small>Новая архитектура · beta</small></span></a>
      <label className="pm-project-field">Текущий проект<input value={projectId} onChange={event => changeProject(event.target.value)} aria-label="Идентификатор проекта" /></label>
      <nav aria-label="Навигация рабочего пространства">
        <button className={route === 'overview' ? 'active' : ''} onClick={() => navigate('overview')}>Обзор продаж</button>
        <button className={route === 'analytics' ? 'active' : ''} onClick={() => navigate('analytics')}>Коммерческая аналитика</button>
        <button className={route === 'causal-lift' ? 'active' : ''} onClick={() => navigate('causal-lift')}>Causal Lift · beta</button>
        <button className={route === 'causal-mmm' ? 'active' : ''} onClick={() => navigate('causal-mmm')}>MMM × Causal Lift · beta</button>
        <button className={route === 'mmm-compare' ? 'active' : ''} onClick={() => navigate('mmm-compare')}>Сравнение MMM · beta</button>
        <button className={route === 'model-tournament' ? 'active' : ''} onClick={() => navigate('model-tournament')}>Model Tournament · beta</button>
        <button className={route === 'models' ? 'active' : ''} onClick={() => navigate('models')}>Модели и актуальность</button>
        <button className={route === 'scenarios' ? 'active' : ''} onClick={() => navigate('scenarios')}>Сценарии и актуальность</button>
        <button className={route === 'snapshot-import' ? 'active' : ''} onClick={() => navigate('snapshot-import')}>Публикация набора данных</button>
      </nav>
      <p className="pm-workspace-note">Данные хранятся в IndexedDB этого браузера. Идентификатор проекта разделяет локальные наборы, но не создаёт совместную облачную базу.</p>
    </aside>
    <div className="pm-workspace-content">{route === 'overview' ? <OverviewPage projectId={projectId} /> : route === 'analytics' ? <ActiveAnalyticsDashboardPage projectId={projectId} /> : route === 'causal-mmm' ? <CausalMmmReconciliationPage projectId={projectId} /> : route === 'model-tournament' ? <ModelTournamentPage projectId={projectId} /> : route === 'mmm-compare' ? <TemporalMmmComparisonPage projectId={projectId} /> : route === 'causal-lift' ? <CausalLiftPage projectId={projectId} /> : route === 'models' ? <ModelRunsFreshnessPage projectId={projectId} /> : route === 'scenarios' ? <ScenarioResultsPage projectId={projectId} /> : <VersionedSnapshotImportPage projectId={projectId} />}</div>
  </div>;
}
