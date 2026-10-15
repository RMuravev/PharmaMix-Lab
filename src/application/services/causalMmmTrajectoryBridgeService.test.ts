import { describe, expect, it } from 'vitest';
import { compareTrajectoryMmmWithStaggeredAtt } from './causalMmmTrajectoryBridgeService';

describe('trajectory-to-ATT bridge validation', () => {
  it('rejects empty panels before attempting model prediction', () => {
    expect(() => compareTrajectoryMmmWithStaggeredAtt({
      panels: [], fit: {featureNames:['weightedVisits'],coefficients:[0,1]},
      carryover: {} as never, hill: {} as never,
      causal: {effects:[],firstTreatment:{}}, driver:'weightedVisits',
      unitIdForPanel: ()=>'unit', populationKey:'study',start:'2025-01',end:'2025-02'
    })).toThrow(/панель/);
  });
});
