import {useMemo} from 'react';
import {useBase, useRecords} from '@airtable/blocks/interface/ui';
import {mondayOfWeek, addDays, fmtDate, isoDay} from '../engine/helpers';
import {HIST_WEEK_COUNT} from '../engine/constants';
import {UK_BANK_HOLIDAYS} from '../engine/constants';

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() &&
         a.getMonth() === b.getMonth() &&
         a.getDate() === b.getDate();
}

function weekIndex(mondays, mon) {
  for (let i = 0; i < mondays.length; i++) {
    if (sameDay(mon, mondays[i])) return i;
  }
  return -1;
}

export function useAirtableData() {
  const base = useBase();

  const buildsTable = base.getTableByNameIfExists('Builds');
  const kpisTable = base.getTableByNameIfExists('KPI Records');
  const kpiMetaTable = base.getTableByNameIfExists('KPIs');

  const fallback = base.tables[0];
  const buildRecords = useRecords(buildsTable || fallback);
  const kpiRecords = useRecords(kpisTable || fallback);
  const kpiMetaRecords = useRecords(kpiMetaTable || fallback);

  return useMemo(() => {
    if (!buildsTable || !kpisTable) return null;

    const missingFields = [];
    const checkField = (table, name) => {
      if (!table.getFieldByNameIfExists(name)) missingFields.push(`${table.name}.${name}`);
    };
    ['Assembly Line', 'Line Slots', 'Build ID', 'First End User', 'End User', 'Scheduled Completion', 'Goods Status', 'Progress', 'Actual Goods Complete Date'].forEach(f => checkField(buildsTable, f));
    ['KPI', 'Type', 'Date', 'Metric'].forEach(f => checkField(kpisTable, f));
    if (missingFields.length > 0) {
      return {error: 'missingFields', missingFields};
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // --- Dynamic historical weeks (rolling window ending at current week) ---
    const currentMonday = mondayOfWeek(today);
    const histWeekMondays = [];
    const histWeekLabels = [];
    for (let i = HIST_WEEK_COUNT - 1; i >= 0; i--) {
      const mon = addDays(currentMonday, -i * 7);
      histWeekMondays.push(mon);
      histWeekLabels.push(fmtDate(mon).slice(0, 6));
    }

    // --- BUILDS → SEQUENCE + PROGRESS ---
    const enduranceBuilds = buildRecords
      .filter(r => {
        const line = r.getCellValueAsString('Assembly Line');
        return line && line.includes('Endurance');
      })
      .sort((a, b) => {
        const slotA = a.getCellValueAsString('Line Slots') || '';
        const slotB = b.getCellValueAsString('Line Slots') || '';
        const numA = parseInt(slotA) || 9999;
        const numB = parseInt(slotB) || 9999;
        return numA - numB;
      });

    const sequence = [];
    const progress = {};

    for (const r of enduranceBuilds) {
      const goodsStatus = r.getCellValueAsString('Goods Status') || '';

      if (goodsStatus.startsWith('Goods Complete') && goodsStatus !== 'Goods Complete') {
        continue;
      }

      const bid = r.getCellValueAsString('Build ID') || '';
      const customer = r.getCellValueAsString('First End User') || r.getCellValueAsString('End User') || '';
      const scheduled = r.getCellValueAsString('Scheduled Completion') || '';
      const slot = parseInt(r.getCellValueAsString('Line Slots')) || 0;

      sequence.push({bid, customer, scheduled, slot});

      const m = bid.match(/BLD-(\d{5})/);
      if (!m) continue;
      const code = m[1];

      const progressPct = r.getCellValue('Progress');
      const goodsDate = r.getCellValueAsString('Actual Goods Complete Date') || null;

      let status = '';
      if (goodsStatus === 'Goods Complete') {
        status = 'Goods Complete';
      } else {
        status = goodsStatus || 'Scheduled';
      }

      const pVal = typeof progressPct === 'number' ? progressPct : 0;

      progress[code] = {
        p: pVal,
        s: status,
        ...(status === 'Goods Complete' && goodsDate ? {goodsDate} : {})
      };
    }

    // Current WiP: sum of capped progress for In-Progress Assembling builds
    let currentWip = 0;
    for (const code in progress) {
      if (progress[code].s === 'In Progress - Assembling') {
        currentWip += Math.min(1, progress[code].p);
      }
    }

    // Projection first Monday: next Monday from today (or today if Monday)
    const dow = today.getDay();
    let projFirstMon;
    if (dow === 1) {
      projFirstMon = new Date(today);
    } else if (dow === 0) {
      projFirstMon = new Date(today);
      projFirstMon.setDate(projFirstMon.getDate() + 1);
    } else {
      projFirstMon = new Date(today);
      projFirstMon.setDate(projFirstMon.getDate() + (8 - dow));
    }

    // --- All historical data from KPI Records table ---
    const histWipWeekly = new Array(HIST_WEEK_COUNT).fill(null);
    const histEndBuilds = new Array(HIST_WEEK_COUNT).fill(0);
    const histTotalHrs = new Array(HIST_WEEK_COUNT).fill(0);
    const histEndHrs = new Array(HIST_WEEK_COUNT).fill(0);

    const kpi132Dates = Array.from({length: HIST_WEEK_COUNT}, () => new Set());
    const kpi356Dates = Array.from({length: HIST_WEEK_COUNT}, () => new Set());
    const kpi376Dates = Array.from({length: HIST_WEEK_COUNT}, () => new Set());

    if (kpiRecords) {
      const kpi132 = [];
      const kpi356 = [];
      const kpi376 = [];

      for (const r of kpiRecords) {
        const kpiName = r.getCellValueAsString('KPI') || '';
        const type = r.getCellValueAsString('Type') || '';
        if (type !== 'Actual') continue;

        const dateStr = r.getCellValueAsString('Date') || '';
        if (!dateStr) continue;

        // Track date presence for completeness warnings before metric check
        const dParsed = new Date(dateStr + 'T00:00:00');
        if (!isNaN(dParsed.getTime())) {
          const mon = mondayOfWeek(dParsed);
          const idx = weekIndex(histWeekMondays, mon);
          if (idx >= 0) {
            if (kpiName.includes('KPI-132')) kpi132Dates[idx].add(dateStr);
            else if (kpiName.includes('KPI-356')) kpi356Dates[idx].add(dateStr);
            else if (kpiName.includes('KPI-376')) kpi376Dates[idx].add(dateStr);
          }
        }

        const metric = r.getCellValue('Metric');
        if (metric == null) continue;

        const val = typeof metric === 'number' ? metric : parseFloat(metric) || 0;

        if (kpiName.includes('KPI-132')) {
          kpi132.push({date: dateStr, value: val});
        } else if (kpiName.includes('KPI-356')) {
          kpi356.push({date: dateStr, value: val});
        } else if (kpiName.includes('KPI-376')) {
          kpi376.push({date: dateStr, value: val});
        }
      }

      // KPI-132: WiP — use last value in each week
      kpi132.sort((a, b) => a.date.localeCompare(b.date));
      for (const k of kpi132) {
        const d = new Date(k.date + 'T00:00:00');
        if (isNaN(d.getTime())) continue;
        const mon = mondayOfWeek(d);
        const idx = weekIndex(histWeekMondays, mon);
        if (idx >= 0) {
          histWipWeekly[idx] = k.value;
        }
      }

      if (currentWip > 0) {
        histWipWeekly[HIST_WEEK_COUNT - 1] = +currentWip.toFixed(2);
      }

      // KPI-356: Total direct assembly hours — aggregate into weekly totals
      for (const k of kpi356) {
        const d = new Date(k.date + 'T00:00:00');
        if (isNaN(d.getTime())) continue;
        const mon = mondayOfWeek(d);
        const idx = weekIndex(histWeekMondays, mon);
        if (idx >= 0) {
          histTotalHrs[idx] += k.value;
          histEndHrs[idx] += k.value;
        }
      }

      // KPI-376: Daily build-equivalents — aggregate into weekly totals
      for (const k of kpi376) {
        const d = new Date(k.date + 'T00:00:00');
        if (isNaN(d.getTime())) continue;
        const mon = mondayOfWeek(d);
        const idx = weekIndex(histWeekMondays, mon);
        if (idx >= 0) {
          histEndBuilds[idx] += k.value;
        }
      }
    }

    // Count working days per historical week and flag incomplete KPI data
    const histWorkingDays = histWeekMondays.map(mon => {
      let n = 0;
      for (let i = 0; i < 5; i++) {
        const d = addDays(mon, i);
        if (!UK_BANK_HOLIDAYS.has(isoDay(d))) n++;
      }
      return n;
    });

    // For the current week, only count working days up to today
    const lastIdx = HIST_WEEK_COUNT - 1;
    const lastMon = histWeekMondays[lastIdx];
    let currentWeekDays = 0;
    for (let i = 0; i < 5; i++) {
      const d = addDays(lastMon, i);
      if (d > today) break;
      if (!UK_BANK_HOLIDAYS.has(isoDay(d))) currentWeekDays++;
    }
    histWorkingDays[lastIdx] = currentWeekDays;

    const histWarnings = {
      kpi132: histWorkingDays.map((wd, i) => kpi132Dates[i].size < wd),
      kpi356: histWorkingDays.map((wd, i) => kpi356Dates[i].size < wd),
      kpi376: histWorkingDays.map((wd, i) => kpi376Dates[i].size < wd),
    };

    return {
      sequence,
      progress,
      currentWip: +currentWip.toFixed(2),
      today,
      projFirstMon,
      histWeekLabels,
      histWipWeekly,
      histEndBuilds,
      histTotalHrs,
      histEndHrs,
      histWarnings,
      buildsTable,
      kpiMetaRecords: kpiMetaTable ? kpiMetaRecords : [],
      isLoading: false
    };
  }, [buildRecords, kpiRecords, kpiMetaRecords]);
}
