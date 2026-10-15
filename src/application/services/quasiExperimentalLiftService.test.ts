import { describe, it, expect } from 'vitest';
import { estimateDifferenceInDifferences } from './quasiExperimentalLiftService';
const data = [
  {unitId:'A',period:'2025-01',treated:true,outcome:100},
  {unitId:'A',period:'2025-02',treated:true,outcome:102},
  {unitId:'A',period:'2025-03',treated:true,outcome:124},
  {unitId:'B',period:'2025-01',treated:false,outcome:90},
  {unitId:'B',period:'2025-02',treated:false,outcome:92},
  {unitId:'B',period:'2025-03',treated:false,outcome:98},
];
describe('quasi-experimental difference-in-differences',()=>{
  it('estimates adjusted lift from shared months',()=>{
    const result=estimateDifferenceInDifferences(data,'2025-03');
    expect(result.absoluteLift).toBe(17);
    expect(result.treatedUnits).toBe(1);
    expect(result.controlUnits).toBe(1);
  });
  it('rejects duplicate unit/month',()=>expect(()=>estimateDifferenceInDifferences([...data,data[0]],'2025-03')).toThrow());
  it('requires a real control group',()=>expect(()=>estimateDifferenceInDifferences(data.filter(x=>x.treated),'2025-03')).toThrow());
  it('requires shared pre and post periods',()=>expect(()=>estimateDifferenceInDifferences(data,'2025-01')).toThrow());
});
