/**
 * 文件: lib/store.js
 * 描述: 公共工具与数据存储类（PointsStore），供各 Tab 模块复用。
 */

/**
 * 工具函数：格式化日期为 YYYY-MM-DD
 * @param {Date} d
 * @returns {string}
 */
export function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/**
 * 工具函数：生成简单唯一ID
 * @returns {string}
 */
export function nextId() {
  return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

/**
 * 类: PointsStore
 * 职责: 管理角色、任务定义、每日任务记录与奖励，并负责积分累加/扣减。
 */
export class PointsStore {
  /**
   * @param {Storage} storage
   * @param {string} key
   */
  constructor(storage, key = 'bleshi-points-data') {
    this.storage = storage;
    this.key = key;
    this.data = {
      roles: [],
      taskDefs: [],
      dailyTasks: {}, // Record<dateStr, Array<{ taskDefId, roleId, title, points, note, completed, completedAt }>>
      rewards: []
    };
    this._load();
    this._migrateLegacyTasks();
  }

  _load() {
    try {
      const raw = this.storage.getItem(this.key);
      if (raw) {
        const parsed = JSON.parse(raw);
        this.data = Object.assign(this.data, parsed);
      }
    } catch (e) {
      console.warn('加载数据失败:', e);
    }
  }

  _save() {
    try {
      this.storage.setItem(this.key, JSON.stringify(this.data));
    } catch (e) {
      console.warn('保存数据失败:', e);
    }
  }

  _migrateLegacyTasks() {}

  addRole(name) {
    if (!name.trim()) return;
    this.data.roles.push({ id: nextId(), name: name.trim(), points: 0 });
    this._save();
  }

  deleteRole(roleId) {
    this.data.roles = this.data.roles.filter(r => r.id !== roleId);
    const delTaskDefIds = this.data.taskDefs.filter(td => td.roleId === roleId).map(td => td.id);
    this.data.taskDefs = this.data.taskDefs.filter(td => td.roleId !== roleId);
    this.data.rewards = this.data.rewards.filter(rw => rw.roleId !== roleId);
    for (const dateStr of Object.keys(this.data.dailyTasks)) {
      this.data.dailyTasks[dateStr] = (this.data.dailyTasks[dateStr] || []).filter(
        it => it.roleId !== roleId && !delTaskDefIds.includes(it.taskDefId)
      );
      if (this.data.dailyTasks[dateStr].length === 0) {
        delete this.data.dailyTasks[dateStr];
      }
    }
    this._save();
  }

  addTaskDef(roleId, title, points, note, repeatType = 'daily', repeatDays = [], repeatUntil = null, priority = 'medium') {
    if (!roleId || !title || points <= 0) return;
    const def = {
      id: nextId(),
      roleId,
      title: title.trim(),
      points: Number(points),
      note: note || '',
      repeatType: repeatType === 'weekly' ? 'weekly' : 'daily',
      repeatDays: Array.isArray(repeatDays) ? repeatDays.slice().map(n => Number(n)) : [],
      repeatUntil: repeatUntil || null,
      priority: ['high', 'medium', 'low'].includes(priority) ? priority : 'medium'
    };
    this.data.taskDefs.push(def);
    this._save();
  }

  deleteTaskDef(taskDefId) {
    this.data.taskDefs = this.data.taskDefs.filter(td => td.id !== taskDefId);
    for (const dateStr of Object.keys(this.data.dailyTasks)) {
      this.data.dailyTasks[dateStr] = (this.data.dailyTasks[dateStr] || []).filter(it => it.taskDefId !== taskDefId);
      if (this.data.dailyTasks[dateStr].length === 0) {
        delete this.data.dailyTasks[dateStr];
      }
    }
    this._save();
  }
 
   /**
    * 更新任务定义（标题/积分/备注/重复频率/周几/截止日期/优先级）
    * 同步未完成的每日任务实例的标题/积分/备注
    * @param {string} taskDefId
    * @param {{roleId?:string,title?:string,points?:number,note?:string,repeatType?:'daily'|'weekly',repeatDays?:Array<number|string>,repeatUntil?:string|null,priority?:'high'|'medium'|'low'}} patch
    */
   updateTaskDef(taskDefId, patch = {}) {
     const td = this.data.taskDefs.find(x => x.id === taskDefId);
     if (!td) return;
     if (typeof patch.roleId === 'string' && patch.roleId) td.roleId = patch.roleId;
     if (typeof patch.title === 'string' && patch.title.trim()) td.title = patch.title.trim();
     if (typeof patch.points === 'number' && patch.points > 0) td.points = Number(patch.points);
     if (typeof patch.note === 'string') td.note = patch.note || '';
     if (patch.repeatType === 'weekly' || patch.repeatType === 'daily') td.repeatType = patch.repeatType;
     if (Array.isArray(patch.repeatDays)) td.repeatDays = patch.repeatDays.slice().map(n => Number(n));
     if (patch.repeatUntil === null || typeof patch.repeatUntil === 'undefined' || typeof patch.repeatUntil === 'string') td.repeatUntil = patch.repeatUntil || null;
     if (['high','medium','low'].includes(patch.priority)) td.priority = patch.priority;
 
     // 同步未完成的每日任务实例的标题/积分/备注
     for (const dateStr of Object.keys(this.data.dailyTasks)) {
       const list = this.data.dailyTasks[dateStr] || [];
       for (const it of list) {
         if (it.taskDefId === taskDefId && !it.completed) {
           it.title = td.title;
           it.points = td.points;
           it.note = td.note || '';
         }
       }
     }
     this._save();
   }

  ensureDaily(dateStr) {
    if (!this.data.dailyTasks[dateStr]) {
      this.data.dailyTasks[dateStr] = [];
    }

    // 1. 清理：移除未完成且不符合当前调度规则的任务
    const [y, m, d] = dateStr.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const weekday = dateObj.getDay();
    const validTasks = [];
    for (const it of this.data.dailyTasks[dateStr]) {
      const td = this.data.taskDefs.find(t => t.id === it.taskDefId);
      if (!td) {
        validTasks.push(it);
        continue;
      }
      const untilOk = !td.repeatUntil || dateStr <= td.repeatUntil;
      let scheduled = true;
      const type = td.repeatType || 'daily';
      if (type === 'weekly') {
        const days = Array.isArray(td.repeatDays) ? td.repeatDays : [];
        scheduled = days.some(d => Number(d) === weekday);
      }
      if (it.completed || (untilOk && scheduled)) {
        validTasks.push(it);
      }
    }
    this.data.dailyTasks[dateStr] = validTasks;

    // 2. 补齐
    const existing = this.data.dailyTasks[dateStr];
    const existingMap = new Map(existing.map(it => [it.taskDefId, it]));
    
    for (const td of this.data.taskDefs) {
      const untilOk = !td.repeatUntil || dateStr <= td.repeatUntil;
      let scheduled = true;
      const type = td.repeatType || 'daily';
      if (type === 'weekly') {
        const days = Array.isArray(td.repeatDays) ? td.repeatDays : [];
        scheduled = days.some(d => Number(d) === weekday);
      }
      if (!untilOk || !scheduled) continue;
      if (!existingMap.has(td.id)) {
        existing.push({
          taskDefId: td.id,
          roleId: td.roleId,
          title: td.title,
          points: td.points,
          note: td.note || '',
          completed: false,
          completedAt: null
        });
      }
    }
    this._save();
    return this.data.dailyTasks[dateStr];
  }

  completeTask(taskDefId, dateStr) {
    const list = this.ensureDaily(dateStr);
    const item = list.find(it => it.taskDefId === taskDefId);
    if (!item || item.completed) return;
    item.completed = true;
    item.completedAt = Date.now();
    const role = this.data.roles.find(r => r.id === item.roleId);
    if (role) role.points += item.points;
    this._save();
  }

  addReward(roleId, title, cost, note) {
    if (!roleId || !title || cost <= 0) return;
    this.data.rewards.push({
      id: nextId(),
      roleId,
      title: title.trim(),
      cost: Number(cost),
      note: note || '',
      redeemedCount: 0
    });
    this._save();
  }

  redeemReward(rewardId) {
    const rw = this.data.rewards.find(r => r.id === rewardId);
    if (!rw) return false;
    const role = this.data.roles.find(r => r.id === rw.roleId);
    if (!role) return false;
    if (role.points < rw.cost) return false;
    role.points -= rw.cost;
    rw.redeemedCount = (rw.redeemedCount || 0) + 1;
    this._save();
    return true;
  }

  getDailyStats(dateStr) {
    const list = this.data.dailyTasks[dateStr] || [];
    let completed = 0, points = 0;
    for (const it of list) {
      if (it.completed) {
        completed++;
        points += (it.points || 0);
      }
    }
    return { completed, points };
  }

  getTaskHistoryStats(taskDefId) {
    let count = 0, sumPoints = 0;
    for (const dateStr of Object.keys(this.data.dailyTasks)) {
      const list = this.data.dailyTasks[dateStr];
      for (const it of list) {
        if (it.taskDefId === taskDefId && it.completed) {
          count++;
          sumPoints += (it.points || 0);
        }
      }
    }
    return { count, sumPoints };
  }

  setData(newData) {
    if (!newData || typeof newData !== 'object') return;
    const safe = {
      roles: Array.isArray(newData.roles) ? newData.roles : [],
      taskDefs: Array.isArray(newData.taskDefs) ? newData.taskDefs : [],
      dailyTasks: typeof newData.dailyTasks === 'object' && newData.dailyTasks ? newData.dailyTasks : {},
      rewards: Array.isArray(newData.rewards) ? newData.rewards : []
    };
    this.data = safe;
    this._save();
  }
}
