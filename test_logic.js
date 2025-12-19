
const taskDefs = [
  { id: 't1', title: 'Daily Task', repeatType: 'daily', repeatUntil: null },
  { id: 't2', title: 'Expired Task', repeatType: 'daily', repeatUntil: '2023-01-01' },
  { id: 't3', title: 'Weekly Task (Mon)', repeatType: 'weekly', repeatDays: [1], repeatUntil: null },
  { id: 't4', title: 'Weekly Task (Mon String)', repeatType: 'weekly', repeatDays: ["1"], repeatUntil: null }
];

const dailyTasks = {};

function ensureDaily(dateStr, taskDefs, dailyTasks) {
  if (!dailyTasks[dateStr]) dailyTasks[dateStr] = [];
  const list = dailyTasks[dateStr];
  const map = new Map(list.map(it => [it.taskDefId, it]));
  const d = new Date(dateStr);
  const weekday = d.getDay(); // 0-6, 0 is Sunday
  
  console.log(`Checking for date: ${dateStr}, weekday: ${weekday}`);

  for (const td of taskDefs) {
    // 截止日期检查
    const untilOk = !td.repeatUntil || dateStr <= td.repeatUntil;
    // 重复频率检查
    let scheduled = true;
    const type = td.repeatType || 'daily';
    if (type === 'weekly') {
      const days = Array.isArray(td.repeatDays) ? td.repeatDays : [];
      scheduled = days.some(d => Number(d) === weekday);
    }

    // console.log(`Task ${td.title}: untilOk=${untilOk}, scheduled=${scheduled}`);

    if (!untilOk || !scheduled) continue;

    if (!map.has(td.id)) {
      list.push({
        taskDefId: td.id,
        title: td.title
      });
    }
  }
  return list;
}

// Test Case 1: Future date (should show t1, maybe t3)
const date1 = '2025-01-01'; // Wednesday
console.log('--- Test 1 (Wed) ---');
const res1 = ensureDaily(date1, taskDefs, dailyTasks);
console.log('Result:', res1.map(t => t.title));
// Expected: Daily Task

// Test Case 2: Past date before expiry (should show t1, t2)
const date2 = '2022-01-01'; // Saturday
console.log('--- Test 2 (Sat) ---');
const res2 = ensureDaily(date2, taskDefs, dailyTasks);
console.log('Result:', res2.map(t => t.title));
// Expected: Daily Task, Expired Task

// Test Case 3: Monday (should show t1, t3, t4)
const date3 = '2025-01-06'; // Monday
console.log('--- Test 3 (Mon) ---');
const res3 = ensureDaily(date3, taskDefs, dailyTasks);
console.log('Result:', res3.map(t => t.title));
// Expected: Daily Task, Weekly Task (Mon), Weekly Task (Mon String)
