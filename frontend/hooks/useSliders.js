import {useState, useCallback, useRef} from 'react';
import {DEFAULT_SLIDERS} from '../engine/constants';

const STORAGE_KEY = "endurance-projector-v1";
const SCENARIOS_KEY = "endurance-projector-scenarios";

function loadFromStorage() {
  try {
    const s = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (s) {
      const merged = {...DEFAULT_SLIDERS};
      for (const k of Object.keys(DEFAULT_SLIDERS)) {
        if (s[k] !== undefined) merged[k] = parseFloat(s[k]);
      }
      return merged;
    }
  } catch (e) {}
  return {...DEFAULT_SLIDERS};
}

function saveToStorage(state) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (e) {}
}

export function useSliders() {
  const [sliders, setSliders] = useState(loadFromStorage);
  const saveTimer = useRef(null);

  const updateSlider = useCallback((id, value) => {
    setSliders(prev => {
      const next = {...prev, [id]: parseFloat(value)};
      if (saveTimer.current) cancelAnimationFrame(saveTimer.current);
      saveTimer.current = requestAnimationFrame(() => saveToStorage(next));
      return next;
    });
  }, []);

  const loadScenarios = useCallback(() => {
    try {
      return JSON.parse(localStorage.getItem(SCENARIOS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }, []);

  const saveScenario = useCallback((name) => {
    const scenarios = loadScenarios();
    scenarios.push({
      id: 'sc-' + Date.now(),
      user: name,
      savedAt: new Date().toISOString(),
      state: {...sliders}
    });
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    return scenarios;
  }, [sliders, loadScenarios]);

  const loadScenario = useCallback((id) => {
    const scenarios = loadScenarios();
    const sc = scenarios.find(s => s.id === id);
    if (sc && sc.state) {
      setSliders(sc.state);
      saveToStorage(sc.state);
    }
  }, [loadScenarios]);

  const deleteScenario = useCallback((id) => {
    const scenarios = loadScenarios().filter(s => s.id !== id);
    localStorage.setItem(SCENARIOS_KEY, JSON.stringify(scenarios));
    return scenarios;
  }, [loadScenarios]);

  return {sliders, updateSlider, loadScenarios, saveScenario, loadScenario, deleteScenario};
}
