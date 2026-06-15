import {isoDay} from './helpers';

export const UK_BANK_HOLIDAYS = new Set([
  "2025-12-25","2025-12-26",
  "2026-01-01","2026-04-03","2026-04-06","2026-05-04","2026-05-25","2026-08-31","2026-12-25","2026-12-28",
  "2027-01-01","2027-04-02","2027-04-05","2027-05-03","2027-05-31","2027-08-30","2027-12-27","2027-12-28",
  "2028-01-03","2028-04-14","2028-04-17","2028-05-01","2028-05-29","2028-08-28","2028-12-25","2028-12-26"
]);

export const HIST_WEEK_COUNT = 6;

export const DEFAULT_SLIDERS = {
  targetWip: 5,
  wipRamp: 12,
  stations: 8,
  startTechs: 10,
  endTechs: 15,
  rampWeeks: 12,
  startHpb: 250,
  hrsPerBuild: 200,
  hpbRamp: 12,
  horizon: 26,
  contractedHrs: 40,
  sicknessPct: 3,
  holidaysPerYear: 30,
  startSlot: 151
};

export const SLIDER_CONFIG = [
  {id: "targetWip", label: "Target WiP (build-equivalents)", min: 0, max: 15, step: 0.5, format: v => v.toFixed(1), group: "scenario"},
  {id: "wipRamp", label: "WiP ramp (weeks to reach target)", min: 1, max: 26, step: 1, format: v => v + " wk", group: "scenario"},
  {id: "stations", label: "Assembly stations (baseline WiP = N/2)", min: 1, max: 20, step: 1, format: v => v, group: "scenario"},
  {id: "startTechs", label: "Techs employed start of ramp", min: 1, max: 50, step: 1, format: v => v, group: "scenario"},
  {id: "endTechs", label: "Techs employed end of ramp", min: 1, max: 50, step: 1, format: v => v, group: "scenario"},
  {id: "rampWeeks", label: "Ramp weeks (techs ramp duration)", min: 1, max: 26, step: 1, format: v => v + " wk", group: "scenario"},
  {id: "startHpb", label: "Start hrs per Endurance build", min: 100, max: 600, step: 5, format: v => v, group: "scenario"},
  {id: "hrsPerBuild", label: "Target hrs per Endurance build", min: 10, max: 500, step: 5, format: v => v, group: "scenario"},
  {id: "hpbRamp", label: "Hrs/build ramp (weeks to reach target)", min: 1, max: 26, step: 1, format: v => v + " wk", group: "scenario"},
  {id: "horizon", label: "Projection horizon (weeks)", min: 8, max: 52, step: 1, format: v => v + " wk", group: "scenario"},
  {id: "contractedHrs", label: "Contracted hours per technician per week", min: 20, max: 48, step: 1, format: v => v + " hr", group: "headcount"},
  {id: "sicknessPct", label: "Sickness rate", min: 0, max: 20, step: 0.5, format: v => v + "%", group: "headcount"},
  {id: "holidaysPerYear", label: "Annual holiday entitlement (days)", min: 0, max: 40, step: 1, format: v => v + " d", group: "headcount"},
];
