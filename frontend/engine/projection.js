import {lerp, addDays, parseDate, isoDay} from './helpers';
import {UK_BANK_HOLIDAYS} from './constants';

export function workingDaysInWeek(mondayDate) {
  let n = 0;
  for (let i = 0; i < 5; i++) {
    const d = new Date(mondayDate);
    d.setDate(d.getDate() + i);
    if (!UK_BANK_HOLIDAYS.has(isoDay(d))) n++;
  }
  return n;
}

export function project(scenario, currentWip, projFirstMon) {
  const out = [];
  let wip = currentWip;
  let cumCompletions = 0;

  for (let w = 1; w <= scenario.horizon; w++) {
    const monday = new Date(projFirstMon);
    monday.setDate(monday.getDate() + (w - 1) * 7);
    const wdays = workingDaysInWeek(monday);
    const bhFactor = wdays / 5;

    const techs = lerp(scenario.startTechs, scenario.endTechs, (w - 1) / scenario.rampWeeks);
    const nominalHrs = techs * scenario.effectivePerTechWeekly;
    const hrs = nominalHrs * bhFactor;
    const hpb = lerp(scenario.currentHpb, scenario.hrsPerBuild, (w - 1) / scenario.hpbRampWeeks);
    const completions = hpb > 0 ? hrs / hpb : 0;
    cumCompletions += completions;

    const wipTarget = lerp(currentWip, scenario.targetWip, (w - 1) / scenario.wipRampWeeks);
    const wipChange = wipTarget - wip;
    wip = wipTarget;
    const newStarts = Math.max(0, completions + wipChange);

    out.push({week: w, monday, hrs, nominalHrs, hpb, completions, cumCompletions, wip, newStarts, workingDays: wdays, techs});
  }
  return out;
}

export function deliveryDates(projection, firstDelivery, sequence, progress, currentWip, today) {
  const dates = [];
  let cumWorkRequired = 0;
  const maxBuilds = Math.min(200, sequence.length);

  for (let n = 1; n <= maxBuilds; n++) {
    const seq = sequence[n - 1];
    const m = seq.bid && seq.bid.match(/BLD-(\d{5})/);
    const code = m ? m[1] : null;
    const prog = code ? progress[code] : null;
    const isGoodsComplete = prog && prog.s === "Goods Complete";

    let date = null;
    if (isGoodsComplete) {
      if (prog.goodsDate) date = parseDate(prog.goodsDate);
    } else if (n === 1 && firstDelivery) {
      date = typeof firstDelivery === 'string' ? parseDate(firstDelivery) : firstDelivery;
    } else {
      const progressVal = prog ? Math.min(1, prog.p) : 0;
      const remaining = Math.max(0, 1 - progressVal);
      cumWorkRequired += remaining;

      if (cumWorkRequired <= 0.001) {
        date = today;
      } else {
        for (let i = 0; i < projection.length; i++) {
          const prevCum = i === 0 ? 0 : projection[i - 1].cumCompletions;
          const curCum = projection[i].cumCompletions;
          if (curCum >= cumWorkRequired) {
            const denom = (curCum - prevCum) || 1;
            const frac = (cumWorkRequired - prevCum) / denom;
            const daysFromToday = (i + frac) * 7;
            date = addDays(today, daysFromToday);
            break;
          }
        }
        if (!date) break;
      }
    }

    const daysFromToday = date ? Math.round((date - today) / 86400000) : null;
    dates.push({n, date, daysFromToday});
  }

  for (let i = 1; i < dates.length; i++) {
    if (dates[i].date && dates[i - 1].date) {
      dates[i].cadence = Math.round((dates[i].date - dates[i - 1].date) / 86400000);
    } else {
      dates[i].cadence = null;
    }
  }
  return dates;
}

export function buildScenario(sliders) {
  const annualContracted = 52 * sliders.contractedHrs;
  const annualHoliday = (sliders.contractedHrs / 5) * sliders.holidaysPerYear;
  const annualSick = annualContracted * (sliders.sicknessPct / 100);
  const effectivePerTechWeekly = Math.max(1, (annualContracted - annualHoliday - annualSick) / 52);

  return {
    targetWip: sliders.targetWip,
    wipRampWeeks: sliders.wipRamp,
    startTechs: sliders.startTechs,
    endTechs: sliders.endTechs,
    rampWeeks: sliders.rampWeeks,
    startHpb: sliders.startHpb,
    hrsPerBuild: sliders.hrsPerBuild,
    hpbRampWeeks: sliders.hpbRamp,
    horizon: sliders.horizon,
    contractedHrs: sliders.contractedHrs,
    sicknessPct: sliders.sicknessPct,
    holidaysPerYear: sliders.holidaysPerYear,
    effectivePerTechWeekly,
    currentHpb: sliders.startHpb
  };
}
