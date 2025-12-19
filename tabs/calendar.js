/**
 * 文件: tabs/calendar.js
 * 描述: 日历页签相关逻辑
 */
import { formatDate } from '../lib/store.js';

export function createCalendarModule(store) {
  const calendar = Vue.reactive({ title: '', cells: [] });
  const current = Vue.reactive({ year: new Date().getFullYear(), month: new Date().getMonth() }); // 0-11

  /**
   * 重建月历
   */
  function rebuildCalendar() {
    const first = new Date(current.year, current.month, 1);
    const title = `${first.getFullYear()}-${String(first.getMonth()+1).padStart(2,'0')}`;
    const startWeekday = new Date(current.year, current.month, 1).getDay(); // 0-6
    const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();
    const prevMonthDays = new Date(current.year, current.month, 0).getDate();

    const todayStr = formatDate(new Date());
    const cells = [];
    for (let i = 0; i < startWeekday; i++) {
      const day = prevMonthDays - startWeekday + 1 + i;
      const d = new Date(current.year, current.month - 1, day);
      const ds = formatDate(d);
      cells.push({ key: 'prev_' + ds, day, dateStr: ds, outside: true, stats: store.getDailyStats(ds), isToday: ds === todayStr });
    }
    for (let day = 1; day <= daysInMonth; day++) {
      const d = new Date(current.year, current.month, day);
      const ds = formatDate(d);
      cells.push({ key: 'cur_' + ds, day, dateStr: ds, outside: false, stats: store.getDailyStats(ds), isToday: ds === todayStr });
    }
    const rest = 42 - cells.length; // 6行
    for (let i = 1; i <= rest; i++) {
      const d = new Date(current.year, current.month + 1, i);
      const ds = formatDate(d);
      cells.push({ key: 'next_' + ds, day: i, dateStr: ds, outside: true, stats: store.getDailyStats(ds), isToday: ds === todayStr });
    }
    calendar.title = title;
    calendar.cells = cells;
  }
  function prevMonth() {
    if (current.month === 0) { current.month = 11; current.year -= 1; } else { current.month -= 1; }
    rebuildCalendar();
  }
  function nextMonth() {
    if (current.month === 11) { current.month = 0; current.year += 1; } else { current.month += 1; }
    rebuildCalendar();
  }
  function goToday() {
    const now = new Date();
    current.year = now.getFullYear();
    current.month = now.getMonth();
    rebuildCalendar();
    openDaily(formatDate(now));
  }
  function openDaily(dateStr) {
    try {
      console.log('[calendar.openDaily] navigate to date=', dateStr);
      const url = `./daily.html?date=${encodeURIComponent(dateStr)}`;
      window.location.assign(url);
    } catch (e) {
      console.error('[calendar.openDaily] navigation error:', e);
      try {
        window.location.href = `./daily.html?date=${encodeURIComponent(dateStr)}`;
      } catch {}
    }
  }
  rebuildCalendar();

  return { calendar, current, rebuildCalendar, prevMonth, nextMonth, goToday, openDaily };
}
