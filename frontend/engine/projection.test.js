import {describe, it, expect} from 'vitest';
import {project, deliveryDates, buildScenario, workingDaysInWeek} from './projection';

// A complete slider set; override per-test as needed.
function sliders(overrides = {}) {
  return {
    targetWip: 5,
    wipRamp: 12,
    stations: 8,
    startTechs: 12,
    endTechs: 12,
    rampWeeks: 12,
    startHpb: 200,
    hrsPerBuild: 200,
    hpbRamp: 12,
    horizon: 26,
    contractedHrs: 40,
    sicknessPct: 0,
    holidaysPerYear: 0,
    ...overrides,
  };
}

// A Monday clear of UK bank holidays so working days = 5 every week.
const MON = new Date(2026, 8, 7); // 2026-09-07, a Monday in a holiday-free stretch

describe('buildScenario', () => {
  it('derives baseline WiP as stations / 2', () => {
    expect(buildScenario(sliders({stations: 8})).baselineWip).toBe(4);
    expect(buildScenario(sliders({stations: 10})).baselineWip).toBe(5);
  });

  it('clamps ramp weeks and stations to >= 1 (no divide-by-zero)', () => {
    const s = buildScenario(sliders({wipRamp: 0, rampWeeks: 0, hpbRamp: 0, stations: 0}));
    expect(s.wipRampWeeks).toBe(1);
    expect(s.rampWeeks).toBe(1);
    expect(s.hpbRampWeeks).toBe(1);
    expect(s.stations).toBe(1);
    // and the projection produces no NaN
    const proj = project(s, 6, MON);
    expect(proj.every(p => Number.isFinite(p.cumOutput))).toBe(true);
  });
});

describe('project — flow balance (output = input − ΔWiP)', () => {
  it('flat WiP: output equals input every week, cumOutput equals cumInput', () => {
    const s = buildScenario(sliders({targetWip: 6}));
    const proj = project(s, 6, MON); // currentWip == targetWip → no WiP change
    for (const p of proj) {
      expect(p.outputRate).toBeCloseTo(p.inputRate, 9);
      expect(p.cumOutput).toBeCloseTo(p.cumInput, 6);
    }
  });

  it('burning WiP down ships a bonus: cumOutput = cumInput − (WiP − WiP0)', () => {
    const s = buildScenario(sliders({targetWip: 4, wipRamp: 8}));
    const currentWip = 12;
    const proj = project(s, currentWip, MON);
    for (const p of proj) {
      expect(p.cumOutput).toBeCloseTo(p.cumInput - (p.wip - currentWip), 6);
      expect(p.cumOutput).toBeGreaterThanOrEqual(p.cumInput); // draining ⇒ output ≥ input
    }
    // total delivery bonus equals the WiP drained
    const last = proj[proj.length - 1];
    expect(last.cumOutput - last.cumInput).toBeCloseTo(currentWip - last.wip, 6);
  });

  it('building WiP up starves output below input', () => {
    const s = buildScenario(sliders({targetWip: 12, wipRamp: 8}));
    const currentWip = 4;
    const proj = project(s, currentWip, MON);
    // while WiP is rising, weekly output < input
    const rising = proj.filter(p => p.wipChange > 1e-9);
    expect(rising.length).toBeGreaterThan(0);
    for (const p of rising) expect(p.outputRate).toBeLessThan(p.inputRate);
  });

  it('output rate is never negative (cannot un-ship a build)', () => {
    const s = buildScenario(sliders({targetWip: 30, wipRamp: 1, startTechs: 1, endTechs: 1, hrsPerBuild: 500}));
    const proj = project(s, 1, MON);
    for (const p of proj) expect(p.outputRate).toBeGreaterThanOrEqual(0);
  });

  it('lead time follows Little’s Law: WiP / output', () => {
    const s = buildScenario(sliders({targetWip: 6}));
    const proj = project(s, 6, MON);
    for (const p of proj) {
      if (p.outputRate > 0) expect(p.leadTimeWeeks).toBeCloseTo(p.wip / p.outputRate, 9);
    }
  });
});

describe('deliveryDates — WiP genuinely moves the schedule', () => {
  // 10 fresh builds (0% progress), all assembled from scratch.
  const sequence = Array.from({length: 10}, (_, i) => ({bid: `BLD-${20000 + i}`}));
  const progress = {};
  const today = new Date(2026, 8, 7);

  function finalDate(targetWip, currentWip) {
    const s = buildScenario(sliders({targetWip, wipRamp: 8}));
    const proj = project(s, currentWip, MON);
    const dates = deliveryDates(proj, null, sequence, progress, currentWip, today);
    const shipped = dates.filter(d => d.date);
    return shipped.length ? shipped[shipped.length - 1].date : null;
  }

  it('burning WiP down pulls the final delivery earlier than holding it flat', () => {
    const burn = finalDate(4, 12);  // drain 12 → 4
    const flat = finalDate(12, 12); // hold at 12
    expect(burn).not.toBeNull();
    expect(flat).not.toBeNull();
    expect(burn.getTime()).toBeLessThan(flat.getTime());
  });

  it('building WiP up pushes the final delivery later than holding it flat', () => {
    const build = finalDate(20, 4); // accumulate 4 → 20
    const flat = finalDate(4, 4);
    expect(build.getTime()).toBeGreaterThan(flat.getTime());
  });

  it('with no WiP change, dates are throughput-bound (independent of WiP level)', () => {
    // Same currentWip == targetWip at two different levels ⇒ identical schedule,
    // because output == input in both cases.
    expect(finalDate(4, 4).getTime()).toBe(finalDate(9, 9).getTime());
  });
});

describe('deliveryDates — special cases', () => {
  const today = new Date(2026, 8, 7);

  it('uses the actual goods-complete date when present', () => {
    const sequence = [{bid: 'BLD-20001'}];
    const progress = {20001: {s: 'Goods Complete', p: 1, goodsDate: '2026-09-01'}};
    const s = buildScenario(sliders());
    const proj = project(s, 6, MON);
    const dates = deliveryDates(proj, null, sequence, progress, 6, today);
    expect(dates[0].date.getFullYear()).toBe(2026);
    expect(dates[0].date.getMonth()).toBe(8);
    expect(dates[0].date.getDate()).toBe(1);
  });

  it('computes cadence between consecutive deliveries', () => {
    const sequence = Array.from({length: 5}, (_, i) => ({bid: `BLD-${20000 + i}`}));
    const s = buildScenario(sliders());
    const proj = project(s, 6, MON);
    const dates = deliveryDates(proj, null, sequence, {}, 6, today);
    const withCadence = dates.filter(d => d.cadence != null);
    expect(withCadence.length).toBeGreaterThan(0);
    for (const d of withCadence) expect(d.cadence).toBeGreaterThanOrEqual(0);
  });
});

describe('workingDaysInWeek', () => {
  it('returns 5 for a holiday-free week', () => {
    expect(workingDaysInWeek(MON)).toBe(5);
  });

  it('subtracts UK bank holidays', () => {
    // Mon–Fri of the week starting 2026-12-21 includes only 2026-12-25 (Christmas);
    // the 2026-12-28 substitute falls in the following week.
    expect(workingDaysInWeek(new Date(2026, 11, 21))).toBe(4);
  });
});
