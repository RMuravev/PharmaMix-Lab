import { describe, expect, it } from 'vitest';
import { matchCausalControls, type ControlPanelRow } from './causalControlMatchingService';
const months=['2026-01','2026-02','2026-03','2026-04','2026-05'];
function panel():ControlPanelRow[] {return ['treated','control'].flatMap(id=>months.map((period,i)=>({unitId:id,period,outcome:100+i*2+(id==='treated' && i===4?15:0),...(id==='treated' && i===4?{exposure:5}:{})})));}
describe('pre-period causal matching',()=>{
 it('interprets missing promo as zero exposure and matches',()=>{const result=matchCausalControls(panel(),'2026-05');expect(result.pairs).toHaveLength(1);expect(result.pairs[0].controlUnit).toBe('control');});
 it('fills missing sales as zero within known calendar',()=>{const rows=panel().filter(r=>!(r.unitId==='control'&&r.period==='2026-02'));const result=matchCausalControls(rows,'2026-05',{calendar:months,maxDistance:10,maxPreTrendGap:10});expect(result.rejected.some(x=>x.includes('неполные продажи'))).toBe(false);});
 it('does not invent units outside explicit universe',()=>{expect(()=>matchCausalControls(panel(),'2026-05',{eligibleUnits:['treated'],calendar:months})).toThrow('вне заявленного охвата');});
 it('rejects pre-exposed units',()=>{const rows=panel();rows.find(r=>r.unitId==='treated'&&r.period==='2026-03')!.exposure=1;expect(()=>matchCausalControls(rows,'2026-05')).toThrow();});
 it('rejects duplicate unit months',()=>expect(()=>matchCausalControls([...panel(),panel()[0]],'2026-05')).toThrow('Дубликат'));
});
