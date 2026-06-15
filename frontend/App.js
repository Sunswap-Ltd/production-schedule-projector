import React, {useMemo, useRef, useEffect, useState, useCallback} from 'react';
import Chart from 'chart.js/auto';
import {expandRecord} from '@airtable/blocks/interface/ui';
import {useAirtableData} from './hooks/useAirtableData';
import {useSliders} from './hooks/useSliders';
import {project, deliveryDates, buildScenario} from './engine/projection';
import {fmtDate, dayName, addDays, parseDate, deliveryWeekMonday, fmtNum} from './engine/helpers';
import {SLIDER_CONFIG} from './engine/constants';
import {styles as S} from './styles';

// ---------- Chart helpers ----------
const chartTextStyle = {color: "#393939", font: {size: 10, family: "-apple-system, Segoe UI, Arial"}};
const gridStyle = {color: "rgba(155,155,155,0.18)", drawBorder: false};

// ---------- Slider component ----------
function Slider({id, label, min, max, step, value, format, onChange}) {
  return (
    <div style={S.ctl}>
      <label style={S.label}>
        {label}
        <span style={S.val}>{format ? format(parseFloat(value)) : value}</span>
      </label>
      <input
        type="range"
        min={min} max={max} step={step}
        value={value}
        onChange={e => onChange(id, e.target.value)}
        style={S.range}
      />
    </div>
  );
}

// ---------- Tab Bar ----------
function TabBar({activeView, onChangeView}) {
  const base = {padding: '8px 20px', fontSize: 13, fontWeight: 500, border: 'none', cursor: 'pointer', borderBottom: '2px solid transparent', background: 'none', color: '#777', fontFamily: '-apple-system, Segoe UI, Arial'};
  const active = {...base, color: '#393939', borderBottomColor: '#ff4700'};
  return (
    <div style={{display: 'flex', gap: 0, borderBottom: '1px solid #e5e5e5', marginBottom: 16}}>
      <button style={activeView === 'charts' ? active : base} onClick={() => onChangeView('charts')}>Charts</button>
      <button style={activeView === 'schedule' ? active : base} onClick={() => onChangeView('schedule')}>Delivery Schedule</button>
    </div>
  );
}

// ---------- Chart component (imperative Chart.js) ----------
function ChartCanvas({id, type, data, options, height}) {
  const canvasRef = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!canvasRef.current || !data) return;

    if (chartRef.current) {
      chartRef.current.data = data;
      chartRef.current.options = options;
      chartRef.current.update('none');
    } else {
      chartRef.current = new Chart(canvasRef.current, {type, data, options});
    }

    return () => {};
  }, [data, options]);

  useEffect(() => {
    return () => {
      if (chartRef.current) {
        chartRef.current.destroy();
        chartRef.current = null;
      }
    };
  }, []);

  return <div style={{position: 'relative', width: '100%', height: height || 200}}><canvas ref={canvasRef} /></div>;
}

// ---------- Chart Section ----------
function ChartSection({title, kpiRef, legends, chartProps, onKpiClick, warnings, weekLabels}) {
  const warningWeeks = warnings && weekLabels ? weekLabels.filter((_, i) => warnings[i]) : [];
  return (
    <div style={{marginBottom: 18}}>
      <h2 style={S.h2}>{title} {kpiRef && <span style={{...S.kpiRef, ...(onKpiClick ? {cursor: 'pointer', textDecoration: 'underline dotted', textUnderlineOffset: 3} : {})}} onClick={onKpiClick}>{kpiRef}</span>}
      {warningWeeks.length > 0 && <span style={{marginLeft: 8, fontSize: 12, color: '#b45309'}} title={'Incomplete data: ' + warningWeeks.join(', ')}>⚠</span>}
      </h2>
      {warningWeeks.length > 0 && (
        <div style={{fontSize: 11, color: '#b45309', margin: '-2px 0 4px'}}>
          ⚠ Incomplete data for: {warningWeeks.join(', ')}
        </div>
      )}
      <div style={S.legend}>
        {legends.map((l, i) => (
          <span key={i}>
            <span style={{...S.swatch, background: l.color}} />{l.label}
          </span>
        ))}
      </div>
      <ChartCanvas {...chartProps} />
    </div>
  );
}

// ---------- Delivery Table ----------
function DeliveryTable({rows, sequence, progress}) {
  return (
    <table style={S.table}>
      <thead>
        <tr>
          <th style={S.th}>Build #</th>
          <th style={S.th}>Build ID</th>
          <th style={S.th}>Customer</th>
          <th style={{...S.th, textAlign: 'right'}}>Progress</th>
          <th style={S.th}>Projected Completion</th>
          <th style={S.th}>MES Schedule</th>
          <th style={S.th}>Delivery week</th>
          <th style={{...S.th, textAlign: 'right'}}>Cadence</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row, i) => {
          const seq = sequence[row.n - 1] || {bid: '—', customer: ''};
          const m = seq.bid.match(/BLD-(\d{5})/);
          const prog = m ? progress[m[1]] : null;
          const isGC = prog && prog.s === 'Goods Complete';
          const bgStyle = isGC && row.date ? {background: '#e1f5ee'} : {};

          let progCell = '—';
          if (prog) {
            if (isGC) progCell = <span style={{color: '#1d9e75', fontWeight: 500}}>100% ✓</span>;
            else progCell = Math.round(Math.min(1, prog.p) * 100) + '%';
          }

          let completionCell = '—';
          let weekCell = '—';
          if (row.date) {
            const tag = isGC ? <span style={S.actualBadge}>ACTUAL</span> : null;
            completionCell = <span>{dayName(row.date)} {fmtDate(row.date)} {tag}</span>;
            weekCell = 'w/c ' + fmtDate(deliveryWeekMonday(row.date));
          } else if (isGC) {
            completionCell = <span style={{color: '#bf6b00'}}>Goods Complete — date missing</span>;
          }

          let schedCell = '—';
          if (seq.scheduled) {
            const sd = parseDate(seq.scheduled);
            if (sd) {
              schedCell = fmtDate(sd);
              if (row.date) {
                const diff = Math.round((row.date - sd) / 86400000);
                if (diff > 7) schedCell = <span>{fmtDate(sd)} <span style={S.deltaRed}>{'+' + diff + 'd'}</span></span>;
                else if (diff > 0) schedCell = <span>{fmtDate(sd)} <span style={S.deltaAmber}>{'+' + diff + 'd'}</span></span>;
                else if (diff < 0) schedCell = <span>{fmtDate(sd)} <span style={S.deltaGreen}>{diff + 'd'}</span></span>;
              }
            }
          }

          return (
            <tr key={i}>
              <td style={S.td}>#{row.n}</td>
              <td style={S.td}>{seq.bid}</td>
              <td style={S.td}>{seq.customer || '—'}</td>
              <td style={{...S.td, textAlign: 'right'}}>{progCell}</td>
              <td style={{...S.td, ...bgStyle}}>{completionCell}</td>
              <td style={S.td}>{schedCell}</td>
              <td style={{...S.td, ...bgStyle}}>{weekCell}</td>
              <td style={{...S.td, textAlign: 'right'}}>{row.cadence != null ? row.cadence : '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

// ---------- Main App ----------
export default function App() {
  const data = useAirtableData();
  const {sliders, updateSlider, loadScenarios, saveScenario, loadScenario, deleteScenario} = useSliders();
  const [scenarioName, setScenarioName] = useState('');
  const [scenarios, setScenarios] = useState(() => {
    try { return JSON.parse(localStorage.getItem('endurance-projector-scenarios')) || []; } catch(e) { return []; }
  });
  const [selectedScenario, setSelectedScenario] = useState('');
  const [activeView, setActiveView] = useState('charts');
  const nHist = data ? data.histWeekLabels.length : 0;

  const handleKpiClick = useCallback((kpiCode) => {
    if (!data || !data.kpiMetaRecords) return;
    const record = data.kpiMetaRecords.find(r => (r.name || '').includes(kpiCode));
    if (record) expandRecord(record);
  }, [data]);

  // Compute projection
  const result = useMemo(() => {
    if (!data || data.error) return null;

    const scenario = buildScenario(sliders);
    const proj = project(scenario, data.currentWip, data.projFirstMon);
    const startSlot = sliders.startSlot || 1;
    const slicedSequence = data.sequence.slice(startSlot - 1);
    const dates = deliveryDates(proj, null, slicedSequence, data.progress, data.currentWip, data.today);
    dates.forEach(d => { d.n += startSlot - 1; });

    const horizonEnd = addDays(data.today, scenario.horizon * 7);
    const inHorizon = dates.filter(d => !d.date || d.date <= horizonEnd);

    // Chart labels
    const labels = data.histWeekLabels.slice();
    let monday = new Date(data.projFirstMon);
    for (let w = 0; w < scenario.horizon; w++) {
      labels.push(fmtDate(monday).slice(0, 6));
      monday = addDays(monday, 7);
    }

    const pad = (arr, projArr) => arr.concat(new Array(scenario.horizon).fill(null));
    const prePad = (projArr) => new Array(nHist).fill(null).concat(projArr);

    // Hours chart data
    const hrsData = {
      labels,
      datasets: [
        {label: 'Actual total direct assembly hrs', data: pad(data.histEndHrs), backgroundColor: '#ff4700', stack: 'hist', yAxisID: 'y'},
        {label: 'Projected total direct assembly hrs', data: prePad(proj.map(p => +p.hrs.toFixed(1))), backgroundColor: '#ffb999', stack: 'proj', yAxisID: 'y'},
        {type: 'line', label: 'Technicians employed', data: prePad(proj.map(p => Math.ceil(p.techs))), borderColor: '#000', backgroundColor: '#000', pointRadius: 3, borderWidth: 2, fill: false, tension: 0, spanGaps: false, yAxisID: 'y1', stack: undefined, order: 0}
      ]
    };
    const hrsOptions = {
      responsive: true, maintainAspectRatio: false, animation: {duration: 0},
      plugins: {legend: {display: false}},
      scales: {
        x: {ticks: {...chartTextStyle, autoSkip: true, maxRotation: 45, minRotation: 45}, grid: {display: false}, stacked: true},
        y: {beginAtZero: true, ticks: chartTextStyle, grid: gridStyle, stacked: true},
        y1: {position: 'right', beginAtZero: true, grid: {display: false}, title: {display: true, text: 'Technicians employed', color: '#393939', font: {size: 11}}, ticks: {...chartTextStyle, stepSize: 1}}
      }
    };

    // Hrs per build chart
    const histHpb = data.histEndHrs.map((h, i) => data.histEndBuilds[i] > 0 ? +(h / data.histEndBuilds[i]).toFixed(1) : null);
    const hpbData = {
      labels,
      datasets: [
        {label: 'Actual hrs / build', data: pad(histHpb), backgroundColor: '#393939', stack: 'hpb'},
        {label: 'Projected hrs / build', data: prePad(proj.map(p => +p.hpb.toFixed(1))), backgroundColor: '#999', stack: 'hpb'}
      ]
    };

    // Completions chart
    const mesSchedule = new Array(scenario.horizon).fill(0);
    const firstProjMon = data.projFirstMon;
    for (const seq of data.sequence) {
      if (!seq.scheduled) continue;
      const m = seq.bid && seq.bid.match(/BLD-(\d{5})/);
      const code = m ? m[1] : null;
      const prog = code ? data.progress[code] : null;
      if (prog && prog.s === 'Goods Complete') continue;
      const progressVal = prog ? Math.min(1, prog.p) : 0;
      const remaining = Math.max(0, 1 - progressVal);
      if (remaining === 0) continue;
      const sd = parseDate(seq.scheduled);
      if (!sd) continue;
      const diffDays = Math.floor((sd - firstProjMon) / 86400000);
      if (diffDays < 0) continue;
      const weekIdx = Math.floor(diffDays / 7);
      if (weekIdx >= 0 && weekIdx < scenario.horizon) mesSchedule[weekIdx] += remaining;
    }

    const completionsData = {
      labels,
      datasets: [
        {label: 'Actual production rate (input)', data: pad(data.histEndBuilds), backgroundColor: '#393939', stack: 'c'},
        {label: 'Projected output (deliveries)', data: prePad(proj.map(p => +p.outputRate.toFixed(3))), backgroundColor: '#ff4700', stack: 'c'},
        {label: 'MES Schedule', data: prePad(mesSchedule.map(v => +v.toFixed(3))), backgroundColor: '#2563EB', stack: 'mes'},
        {type: 'line', label: 'Projected input (work fed in)', data: prePad(proj.map(p => +p.inputRate.toFixed(3))), borderColor: '#999', borderWidth: 2, pointRadius: 0, borderDash: [4, 3], fill: false, tension: 0, order: 0}
      ]
    };

    // WiP chart
    const lastHist = data.histWipWeekly[data.histWipWeekly.length - 1];
    const wipData = {
      labels,
      datasets: [
        {label: 'Actual WiP', data: data.histWipWeekly.concat(new Array(scenario.horizon).fill(null)), borderColor: '#393939', borderWidth: 1.8, pointRadius: 2.5, fill: false, tension: 0.25},
        {label: 'Projected WiP', data: new Array(nHist - 1).fill(null).concat([lastHist]).concat(proj.map(p => +p.wip.toFixed(2))), borderColor: '#ff4700', borderWidth: 2, pointRadius: 2.5, fill: false, tension: 0, borderDash: [4, 3]}
      ]
    };

    const barOptions = {
      responsive: true, maintainAspectRatio: false, animation: {duration: 0},
      plugins: {legend: {display: false}},
      scales: {
        x: {ticks: {...chartTextStyle, autoSkip: true, maxRotation: 45, minRotation: 45}, grid: {display: false}, stacked: true},
        y: {beginAtZero: true, ticks: chartTextStyle, grid: gridStyle, stacked: true}
      }
    };
    const lineOptions = {
      responsive: true, maintainAspectRatio: false, animation: {duration: 0},
      plugins: {legend: {display: false}},
      scales: {
        x: {ticks: {...chartTextStyle, autoSkip: true, maxRotation: 45, minRotation: 45}, grid: {display: false}},
        y: {beginAtZero: true, ticks: chartTextStyle, grid: gridStyle}
      }
    };

    // Flow-balance + Little's-Law lead-time readout
    const wipDelta = +(data.currentWip - scenario.targetWip).toFixed(1); // >0 = draining WiP
    const leadNow = proj.length ? proj[0].leadTimeWeeks : null;
    const leadEnd = proj.length ? proj[proj.length - 1].leadTimeWeeks : null;
    const readout = {
      currentWip: data.currentWip,
      targetWip: scenario.targetWip,
      baselineWip: scenario.baselineWip,
      stations: scenario.stations,
      wipDelta,
      leadNow,
      leadEnd,
      belowBaseline: scenario.targetWip < scenario.baselineWip
    };

    return {inHorizon, hrsData, hrsOptions, hpbData, completionsData, wipData, barOptions, lineOptions, scenario, proj, readout};
  }, [data, sliders]);

  if (!data) {
    return (
      <div style={{padding: 24, fontFamily: '-apple-system, Segoe UI, Arial', color: '#393939'}}>
        <h2 style={{margin: '0 0 12px'}}>Endurance build completion projector</h2>
        <p>Loading data from Airtable tables...</p>
        <p style={{fontSize: 12, color: '#777'}}>This extension requires two tables: <strong>Builds</strong> and <strong>KPI Records</strong>.</p>
      </div>
    );
  }

  if (data.error === 'missingFields') {
    return (
      <div style={{padding: 24, fontFamily: '-apple-system, Segoe UI, Arial', color: '#393939'}}>
        <h2 style={{margin: '0 0 12px'}}>Endurance build completion projector</h2>
        <p>Some required fields are not visible in this interface.</p>
        <p style={{fontSize: 12, color: '#777'}}>Please enable the following fields in the interface Data settings (click on the extension, then Fields gear icon, select each table and show all fields):</p>
        <ul style={{fontSize: 12, color: '#c00', margin: '8px 0', paddingLeft: 20}}>
          {data.missingFields.map((f, i) => <li key={i}>{f}</li>)}
        </ul>
      </div>
    );
  }

  const scenarioSliders = SLIDER_CONFIG.filter(s => s.group === 'scenario');
  const headcountSliders = SLIDER_CONFIG.filter(s => s.group === 'headcount');

  return (
    <div style={S.body}>
      <h1 style={S.h1}>Endurance build completion projector</h1>
      <p style={S.sub}>
        Scenario tool — live data from Airtable. Drag sliders to model WiP burn-down, labour-hour ramp, and Endurance share.
        Deliveries follow a flow balance: output = input − change in WiP. Burning WiP down ships a one-off bonus of finished builds, pulling dates earlier; letting WiP build up starves output and pushes them out.
      </p>

      <div style={S.layout}>
        {/* Sidebar */}
        <aside style={S.sidebar}>
          <div style={S.controls}>
            <div style={S.panelTitle}>Scenario</div>
            {scenarioSliders.map(s => (
              <Slider key={s.id} {...s} value={sliders[s.id]} onChange={updateSlider} />
            ))}
            <div style={{fontSize: 11, color: '#777', lineHeight: 1.4, margin: '2px 0 8px'}}>
              Baseline WiP = stations ÷ 2 = {(sliders.stations / 2).toFixed(1)} build-equivalents (one build per station, on average half-done). WiP above this is dead queue. Burning WiP toward target delivers the drained builds as a one-off; deliveries otherwise track input throughput.
            </div>
            <div style={S.ctl}>
              <label style={S.label}>Start from build #</label>
              <input type="number" min={1} max={999} value={sliders.startSlot || 1} onChange={e => updateSlider('startSlot', e.target.value)} style={S.dateInput} />
            </div>

            <div style={{...S.panelTitle, marginTop: 14}}>Headcount inputs</div>
            {headcountSliders.map(s => (
              <Slider key={s.id} {...s} value={sliders[s.id]} onChange={updateSlider} />
            ))}

            <div style={{...S.panelTitle, marginTop: 14}}>Saved scenarios</div>
            <div style={S.ctl}>
              <input type="text" placeholder="Your name" value={scenarioName} onChange={e => setScenarioName(e.target.value)} style={S.textInput} />
              <button style={S.btn} onClick={() => { const s = saveScenario(scenarioName); setScenarios(s); }}>Save current scenario</button>
              <div style={{display: 'flex', gap: 6, marginTop: 4}}>
                <select value={selectedScenario} onChange={e => setSelectedScenario(e.target.value)} style={{...S.textInput, flex: 1}}>
                  <option value="">— Load saved scenario —</option>
                  {scenarios.map(s => <option key={s.id} value={s.id}>{s.user} ({new Date(s.savedAt).toLocaleDateString()})</option>)}
                </select>
                <button style={S.btn} onClick={() => { if (selectedScenario) loadScenario(selectedScenario); }}>Load</button>
                <button style={S.btn} onClick={() => { if (selectedScenario) { const s = deleteScenario(selectedScenario); setScenarios(s); setSelectedScenario(''); } }}>×</button>
              </div>
            </div>
          </div>
        </aside>

        {/* Main */}
        <main style={S.main}>
          {result && (
            <>
              <TabBar activeView={activeView} onChangeView={setActiveView} />

              {activeView === 'charts' && (
                <>
                  <ChartSection
                    title="Daily Production Team Checked In Time"
                    kpiRef="— KPI-356"
                    onKpiClick={() => handleKpiClick('KPI-356')}
                    warnings={data.histWarnings.kpi356}
                    weekLabels={data.histWeekLabels}
                    legends={[
                      {color: '#ff4700', label: 'Actual total direct assembly hrs'},
                      {color: '#ffb999', label: 'Projected total direct assembly hrs'},
                      {color: '#000', label: 'Technicians employed (right axis)'}
                    ]}
                    chartProps={{id: 'hrs', type: 'bar', data: result.hrsData, options: result.hrsOptions}}
                  />

                  <ChartSection
                    title="Hours per Endurance unit (all assembly)"
                    kpiRef="— KPI-356 ÷ KPI-376"
                    onKpiClick={() => handleKpiClick('KPI-376')}
                    warnings={data.histWarnings.kpi356.map((w, i) => w || data.histWarnings.kpi376[i])}
                    weekLabels={data.histWeekLabels}
                    legends={[
                      {color: '#393939', label: 'Actual hrs / Endurance build'},
                      {color: '#999', label: 'Projected (ramps to target)'}
                    ]}
                    chartProps={{id: 'hpb', type: 'bar', data: result.hpbData, options: result.barOptions}}
                  />

                  <ChartSection
                    title="Total Endurance Line WIP"
                    kpiRef="— KPI-132"
                    onKpiClick={() => handleKpiClick('KPI-132')}
                    warnings={data.histWarnings.kpi132}
                    weekLabels={data.histWeekLabels}
                    legends={[
                      {color: '#393939', label: 'Actual weekly WiP (end-of-week)'},
                      {color: '#ff4700', label: 'Projected WiP path'}
                    ]}
                    chartProps={{id: 'wip', type: 'line', data: result.wipData, options: result.lineOptions}}
                  />

                  <div style={{fontSize: 12, color: '#393939', background: '#faf7f5', border: '1px solid #eee', borderRadius: 6, padding: '8px 12px', margin: '-6px 0 18px', lineHeight: 1.5}}>
                    {result.readout.wipDelta > 0
                      ? <span><strong>Flow balance:</strong> WiP drains {result.readout.currentWip} → {result.readout.targetWip} ({result.readout.wipDelta} build-equivalents), shipped as a one-off output bonus on top of input — pulling dates in.</span>
                      : result.readout.wipDelta < 0
                        ? <span style={{color: '#b45309'}}><strong>Flow balance:</strong> WiP builds {result.readout.currentWip} → {result.readout.targetWip} ({Math.abs(result.readout.wipDelta)} build-equivalents), starving output below input — pushing dates out.</span>
                        : <span><strong>Flow balance:</strong> WiP flat at {result.readout.currentWip} — output equals input, dates are throughput-bound.</span>}
                    <br />
                    <strong>Lead time (Little&rsquo;s Law, WiP ÷ output):</strong>{' '}
                    {result.readout.leadNow != null ? result.readout.leadNow.toFixed(1) + ' wk now' : '—'}
                    {result.readout.leadEnd != null ? ' → ' + result.readout.leadEnd.toFixed(1) + ' wk at target WiP' : ''}.
                    {' '}Baseline WiP {result.readout.baselineWip.toFixed(1)} ({result.readout.stations} stations).
                    {result.readout.belowBaseline && <span style={{color: '#b45309'}}> &nbsp;Target WiP is below baseline — the line can&rsquo;t stay full at that level.</span>}
                  </div>

                  <ChartSection
                    title="Endurance Production Rate"
                    kpiRef="— KPI-376"
                    onKpiClick={() => handleKpiClick('KPI-376')}
                    warnings={data.histWarnings.kpi376}
                    weekLabels={data.histWeekLabels}
                    legends={[
                      {color: '#393939', label: 'Actual production rate (input)'},
                      {color: '#ff4700', label: 'Projected output (deliveries)'},
                      {color: '#999', label: 'Projected input (work fed in)'},
                      {color: '#2563EB', label: 'MES Schedule'}
                    ]}
                    chartProps={{id: 'completions', type: 'bar', data: result.completionsData, options: result.barOptions}}
                  />
                </>
              )}

              {activeView === 'schedule' && (
                <>
                  <h2 style={S.h2}>Projected delivery schedule</h2>
                  <DeliveryTable rows={result.inHorizon} sequence={data.sequence} progress={data.progress} />
                  <div style={S.note}>{result.inHorizon.length} deliveries in horizon.</div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </div>
  );
}
