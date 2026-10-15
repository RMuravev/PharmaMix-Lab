import { PharmaStoreState } from '../../core/store';

const STORAGE_KEY = 'pharma_mix_lab_ui_state';

interface PersistedUIState {
  activePage: string;
  viewMode: 'analyst' | 'presentation';
  lastAccessed: number;
}

/**
 * Service to manage UI state persistence across sessions.
 */
export const persistenceService = {
  /**
   * Saves the current UI state to localStorage.
   */
  saveUIState(state: PharmaStoreState): void {
    const uiState: PersistedUIState = {
      activePage: state.activePage,
      viewMode: state.viewMode,
      lastAccessed: Date.now()
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(uiState));
  },

  /**
   * Loads the UI state from localStorage.
   */
  loadUIState(): Partial<PersistedUIState> | null {
    const data = localStorage.getItem(STORAGE_KEY);
    if (!data) return null;
    try {
      return JSON.parse(data);
    } catch {
      return null;
    }
  },

  /**
   * Clears the persisted UI state.
   */
  clearUIState(): void {
    localStorage.removeItem(STORAGE_KEY);
  }
};
