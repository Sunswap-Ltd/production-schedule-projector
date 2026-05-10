const MONTHS = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"];

export function lerp(a, b, t) {
  if (t >= 1) return b;
  if (t <= 0) return a;
  return a + (b - a) * t;
}

export function fmtDate(d) {
  return String(d.getDate()).padStart(2, "0") + " " + MONTHS[d.getMonth()] + " " + String(d.getFullYear()).slice(-2);
}

export function dayName(d) {
  return ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"][d.getDay()];
}

export function addDays(d, n) {
  const r = new Date(d.getTime());
  r.setDate(r.getDate() + n);
  return r;
}

export function parseDate(s) {
  if (!s) return null;
  const [y, m, d] = s.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function isoDay(d) {
  return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
}

export function deliveryWeekMonday(d) {
  const dow = d.getDay();
  if (dow === 0) return addDays(d, 1);
  if (dow === 6) return addDays(d, 2);
  return addDays(d, -(dow - 1));
}

export function mondayOfWeek(d) {
  const dow = d.getDay();
  if (dow === 0) return addDays(d, -6);
  return addDays(d, -(dow - 1));
}

export function fmtNum(v, decimals) {
  if (v == null) return "—";
  return typeof v === "number" ? v.toFixed(decimals != null ? decimals : 1) : String(v);
}
