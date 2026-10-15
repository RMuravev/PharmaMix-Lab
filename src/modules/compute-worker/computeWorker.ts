import { runAutoMLEngine } from '../mmm-engine/automlEngine';
import { fitMMMModel } from '../mmm-engine/regression';

/**
 * Background compute worker for heavy MMM and AutoML calculations.
 */
self.onmessage = (e: MessageEvent) => {
  const { type, payload, id } = e.data;

  try {
    if (type === 'RUN_AUTOML') {
      const { panel, sales, promos, market, margin } = payload;
      const result = runAutoMLEngine(panel, sales, promos, market, margin);
      self.postMessage({ type: 'AUTOML_SUCCESS', payload: result, id });
    } else if (type === 'FIT_MMM_MODEL') {
      const { panel, useMkt } = payload;
      const result = fitMMMModel(panel, useMkt);
      self.postMessage({ type: 'FIT_MMM_SUCCESS', payload: result, id });
    } else {
      self.postMessage({ type: 'ERROR', payload: `Unknown task type: ${type}`, id });
    }
  } catch (err: any) {
    self.postMessage({ type: 'ERROR', payload: err.message, id });
  }
};
