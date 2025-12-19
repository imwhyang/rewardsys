/**
 * 文件: app.js
 * 描述: 首页核心逻辑与数据存储。包含 PointsStore 类与界面交互。
 * 说明: 通过 localStorage('bleshi-points-data') 持久化数据；提供任务、奖励、角色与日历统计。
 */
(function () {
  const { createApp, reactive, computed, watch } = Vue;

  /**
   * 工具函数：格式化日期为 YYYY-MM-DD
   * @param {Date} d
   * @returns {string}
   */
  function formatDate(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  /**
   * 工具函数：生成简单唯一ID
   * @returns {string}
   */
  function nextId() {
    return 'id_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }

  /**
   * 类: PointsStore
   * 职责: 管理角色、任务定义、每日任务记录与奖励，并负责积分累加/扣减。
   */
  class PointsStore {
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

    /**
     * 覆盖当前数据并保存
     * @param {object} newData
     */
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

    /**
     * 文件读入
     */
    _load() {
      try {
        const raw = this.storage.getItem(this.key);
        if (raw) {
          const parsed = JSON.parse(raw);
          // 基于结构的简单保护
          this.data = Object.assign(this.data, parsed);
        }
      } catch (e) {
        console.warn('加载数据失败:', e);
      }
    }

    /**
     * 写回 localStorage
     */
    _save() {
      try {
        this.storage.setItem(this.key, JSON.stringify(this.data));
      } catch (e) {
        console.warn('保存数据失败:', e);
      }
    }

    /**
     * 迁移旧任务结构（占位，便于后续扩展）
     */
    _migrateLegacyTasks() {
      // 如历史版本存在旧结构 tasks，可在此合并至 dailyTasks 等
    }

    /**
     * 添加角色
     * @param {string} name
     */
    addRole(name) {
      if (!name.trim()) return;
      this.data.roles.push({ id: nextId(), name: name.trim(), points: 0 });
      this._save();
    }

    /**
     * 删除角色（级联删除任务定义、每日任务记录与奖励）
     * @param {string} roleId
     */
    deleteRole(roleId) {
      this.data.roles = this.data.roles.filter(r => r.id !== roleId);
      const delTaskDefIds = this.data.taskDefs.filter(td => td.roleId === roleId).map(td => td.id);
      this.data.taskDefs = this.data.taskDefs.filter(td => td.roleId !== roleId);
      this.data.rewards = this.data.rewards.filter(rw => rw.roleId !== roleId);
      // 删除每日任务中对应的 taskDefId 或 roleId
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

    /**
     * 添加任务定义
     * @param {string} roleId
     * @param {string} title
     * @param {number} points
     * @param {string} note
     */
    addTaskDef(roleId, title, points, note) {
      if (!roleId || !title || points <= 0) return;
      this.data.taskDefs.push({ id: nextId(), roleId, title: title.trim(), points: Number(points), note: note || '' });
      this._save();
    }

    /**
     * 删除任务定义（级联删除所有每日记录）
     * @param {string} taskDefId
     */
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
     * 确保指定日期的每日任务列表包含所有任务定义（默认未完成）
     * @param {string} dateStr
     * @returns {Array}
     */
    ensureDaily(dateStr) {
      if (!this.data.dailyTasks[dateStr]) {
        this.data.dailyTasks[dateStr] = [];
      }
      const existing = this.data.dailyTasks[dateStr];
      const existingMap = new Map(existing.map(it => [it.taskDefId, it]));
      for (const td of this.data.taskDefs) {
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

    /**
     * 完成指定日期的某个每日任务，并为角色加积分
     * @param {string} taskDefId
     * @param {string} dateStr
     */
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

    /**
     * 添加奖励
     * @param {string} roleId
     * @param {string} title
     * @param {number} cost
     * @param {string} note
     */
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

    /**
     * 兑换奖励（扣减积分并累加兑换次数）
     * @param {string} rewardId
     */
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

    /**
     * 统计某一天的完成数量与积分
     * @param {string} dateStr
     * @returns {{completed:number, points:number}}
     */
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

    /**
     * 统计某个任务定义的历史完成次数与累计积分
     * @param {string} taskDefId
     * @returns {{count:number, sumPoints:number}}
     */
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
  }

  // 创建 Store（响应式包装）
  const store = new PointsStore(localStorage);
  const state = reactive(store.data);

  // Vue 应用
  const app = createApp({
    /**
     * 文件注释：顶层应用状态与方法。
     */
    setup() {
      const today = formatDate(new Date());
      const url = new URL(location.href);
      const initTab = url.searchParams.get('tab') || 'roles';
      const activeTab = reactive({ v: initTab });
      const modals = reactive({ addTask: false, addReward: false, importData: false });
      const taskForm = reactive({ roleId: '', title: '', points: 1, note: '' });
      const rewardForm = reactive({ roleId: '', title: '', cost: 1, note: '' });
      const newRoleName = reactive({ v: '' });
      const notice = reactive({ show: false, text: '' });
      const confirm = reactive({ show: false, title: '', message: '' });
      let confirmHandler = null;
      const importForm = reactive({ text: '', fileText: '' });

      // 计算属性：总积分
      const totalPoints = computed(() => state.roles.reduce((sum, r) => sum + (r.points || 0), 0));

      // 角色操作
      function addRole() {
        if (!newRoleName.v.trim()) return;
        store.addRole(newRoleName.v.trim());
        newRoleName.v = '';
      }
      function deleteRole(roleId) {
        store.deleteRole(roleId);
      }

      // 任务相关
      function taskDefsByRole(roleId) {
        return state.taskDefs.filter(td => td.roleId === roleId);
      }
      function taskHistoryStats(taskDefId) {
        return store.getTaskHistoryStats(taskDefId);
      }
      /**
       * 判断指定任务定义是否已在“今天”完成
       * @param {string} taskDefId
       * @returns {boolean}
       */
      function isCompletedToday(taskDefId) {
        const list = state.dailyTasks[today] || [];
        return !!list.find(it => it.taskDefId === taskDefId && it.completed);
      }
      /**
       * 基于响应式 dailyTasks 计算任务历史统计，确保变更后自动刷新
       * @param {string} taskDefId
       * @returns {{count:number,sumPoints:number}}
       */
      function taskHistoryStatsReactive(taskDefId) {
        const dt = state.dailyTasks;
        let count = 0, sum = 0;
        for (const dateStr of Object.keys(dt)) {
          const list = dt[dateStr] || [];
          for (const it of list) {
            if (it.taskDefId === taskDefId && it.completed) {
              count++; sum += (it.points || 0);
            }
          }
        }
        return { count, sumPoints: sum };
      }
      /**
       * 打开完成确认
       * @param {string} taskDefId
       */
      function askComplete(taskDefId) {
        console.log('[askComplete] clicked taskDefId=', taskDefId, 'today=', today);
        openConfirm(
          '确认完成',
          '将记录该任务今日完成并为角色增加积分。是否确认？',
          () => {
            console.log('[askComplete] confirm handler start for taskDefId=', taskDefId);
            store.completeTask(taskDefId, today);
            rebuildCalendar();
            showNotice('已完成今日任务并增加积分');
            console.log('[askComplete] confirm handler end');
          }
        );
      }
      /**
       * 确认完成今日任务并刷新统计
       */
      function confirmComplete() {
        if (!completeTargetId) { modals.completeTask = false; return; }
        store.completeTask(completeTargetId, today);
        modals.completeTask = false;
        completeTargetId = null;
        rebuildCalendar();
        showNotice('已完成今日任务并增加积分');
      }
      function openAddTaskModal() {
        modals.addTask = true;
        taskForm.roleId = state.roles[0]?.id || '';
        taskForm.title = '';
        taskForm.points = 1;
        taskForm.note = '';
      }
      function submitTask() {
        if (!taskForm.roleId || !taskForm.title || taskForm.points <= 0) return;
        store.addTaskDef(taskForm.roleId, taskForm.title, taskForm.points, taskForm.note);
        // 新增后可补齐今天的每日列表，便于立即完成
        store.ensureDaily(today);
        modals.addTask = false;
      }
      function deleteTaskDef(taskDefId) {
        console.log('[deleteTaskDef] clicked taskDefId=', taskDefId);
        openConfirm(
          '确认删除任务',
          '将删除该任务定义并清理所有每日记录。是否确认？',
          () => {
            console.log('[deleteTaskDef] confirm handler start for taskDefId=', taskDefId);
            store.deleteTaskDef(taskDefId);
            rebuildCalendar();
            showNotice('已删除任务定义并清理每日记录');
            console.log('[deleteTaskDef] confirm handler end');
          }
        );
      }

      // 奖励相关
      function rewardsByRole(roleId) {
        return state.rewards.filter(rw => rw.roleId === roleId);
      }
      function openAddRewardModal() {
        modals.addReward = true;
        rewardForm.roleId = state.roles[0]?.id || '';
        rewardForm.title = '';
        rewardForm.cost = 1;
        rewardForm.note = '';
      }
      function submitReward() {
        if (!rewardForm.roleId || !rewardForm.title || rewardForm.cost <= 0) return;
        store.addReward(rewardForm.roleId, rewardForm.title, rewardForm.cost, rewardForm.note);
        modals.addReward = false;
      }
      /**
       * 打开兑换确认
       * @param {string} rewardId
       */
      function askRedeem(rewardId) {
        console.log('[askRedeem] clicked rewardId=', rewardId);
        openConfirm(
          '确认兑换',
          '将为角色扣减对应积分并增加奖励的兑换次数。是否确认兑换该奖励？',
          () => {
            console.log('[askRedeem] confirm handler start for rewardId=', rewardId);
            const ok = store.redeemReward(rewardId);
            if (ok) {
              showNotice('兑换成功，积分已扣减');
            } else {
              showNotice('兑换失败：积分不足或奖励不存在');
            }
            console.log('[askRedeem] confirm handler end, ok=', ok);
          }
        );
      }
      /**
       * 确认兑换奖励并自动刷新（响应式会更新）
       */
      function confirmRedeem() {}
      /**
       * 显示顶部提示条
       * @param {string} text
       */
      function showNotice(text) {
        console.log('[notice] show:', text);
        notice.text = text;
        notice.show = true;
        setTimeout(() => { notice.show = false; }, 2000);
      }
      /**
       * 打开统一确认弹窗
       * @param {string} title
       * @param {string} message
       * @param {Function} handler
       */
      function openConfirm(title, message, handler) {
        console.log('[openConfirm] title=', title, 'message=', message);
        confirm.title = title;
        confirm.message = message;
        confirmHandler = handler;
        confirm.show = true;
      }
      function confirmAction() {
        console.log('[confirmAction] invoked');
        try { confirmHandler && confirmHandler(); } finally {
          confirm.show = false; confirmHandler = null;
        }
      }
      function cancelConfirm() {
        console.log('[cancelConfirm] invoked');
        confirm.show = false; confirmHandler = null;
      }

      // 日历
      const calendar = reactive({ title: '', cells: [] });
      const current = reactive({ year: new Date().getFullYear(), month: new Date().getMonth() }); // 0-11
      function rebuildCalendar() {
        const first = new Date(current.year, current.month, 1);
        const title = `${first.getFullYear()}-${String(first.getMonth()+1).padStart(2,'0')}`;
        const startWeekday = new Date(current.year, current.month, 1).getDay(); // 0-6
        const daysInMonth = new Date(current.year, current.month + 1, 0).getDate();
        const prevMonthDays = new Date(current.year, current.month, 0).getDate();

        const cells = [];
        // 填充上月尾
        for (let i = 0; i < startWeekday; i++) {
          const day = prevMonthDays - startWeekday + 1 + i;
          const d = new Date(current.year, current.month - 1, day);
          const ds = formatDate(d);
          cells.push({
            key: 'prev_' + ds,
            day,
            dateStr: ds,
            outside: true,
            stats: store.getDailyStats(ds)
          });
        }
        // 本月
        for (let day = 1; day <= daysInMonth; day++) {
          const d = new Date(current.year, current.month, day);
          const ds = formatDate(d);
          cells.push({
            key: 'cur_' + ds,
            day,
            dateStr: ds,
            outside: false,
            stats: store.getDailyStats(ds)
          });
        }
        // 填充下月头
        const rest = 42 - cells.length; // 6行
        for (let i = 1; i <= rest; i++) {
          const d = new Date(current.year, current.month + 1, i);
          const ds = formatDate(d);
          cells.push({
            key: 'next_' + ds,
            day: i,
            dateStr: ds,
            outside: true,
            stats: store.getDailyStats(ds)
          });
        }
        calendar.title = title;
        calendar.cells = cells;
      }
      function prevMonth() {
        if (current.month === 0) {
          current.month = 11; current.year -= 1;
        } else {
          current.month -= 1;
        }
        rebuildCalendar();
      }
      function nextMonth() {
        if (current.month === 11) {
          current.month = 0; current.year += 1;
        } else {
          current.month += 1;
        }
        rebuildCalendar();
      }
      function goToday() {
        const now = new Date();
        current.year = now.getFullYear();
        current.month = now.getMonth();
        rebuildCalendar();
      }
      function openDaily(dateStr) {
        location.href = `./daily.html?date=${encodeURIComponent(dateStr)}`;
      }
      rebuildCalendar();
      // 确保今天的每日列表已生成，便于按钮禁用状态与统计联动
      store.ensureDaily(today);

      // 主题
      const themeKey = 'bleshi-theme';
      function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }
      function getTheme() { return localStorage.getItem(themeKey) || 'light'; }
      function setTheme(t) { localStorage.setItem(themeKey, t); applyTheme(t); }
      const themeLabel = computed(() => getTheme() === 'dark' ? '夜间' : '日间');
      function toggleTheme() { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }
      applyTheme(getTheme());

      // 导入/导出
      function openImportModal() {
        modals.importData = true;
        importForm.text = '';
        importForm.fileText = '';
      }
      function onImportFileChange(e) {
        const file = e.target.files && e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { importForm.fileText = String(reader.result || ''); };
        reader.readAsText(file);
      }
      function submitImport() {
        const raw = (importForm.fileText || importForm.text || '').trim();
        if (!raw) { modals.importData = false; return; }
        try {
          const parsed = JSON.parse(raw);
          store.setData(parsed);
          // 导入后更新本地响应对象引用
          Object.assign(state.roles, store.data.roles);
          Object.assign(state.taskDefs, store.data.taskDefs);
          state.dailyTasks = store.data.dailyTasks;
          Object.assign(state.rewards, store.data.rewards);
          rebuildCalendar();
          showNotice('导入成功');
        } catch {
          showNotice('导入失败：JSON格式错误');
        }
        modals.importData = false;
      }
      function exportData() {
        const json = JSON.stringify(store.data, null, 2);
        const blob = new Blob([json], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        const ts = new Date();
        const name = `points-data-${ts.getFullYear()}${String(ts.getMonth()+1).padStart(2,'0')}${String(ts.getDate()).padStart(2,'0')}.json`;
        a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
        URL.revokeObjectURL(url);
        showNotice('已导出数据文件');
      }

      // 将状态与方法暴露给模板
      return {
        roles: state.roles,
        taskDefs: state.taskDefs,
        rewards: state.rewards,
        dailyTasks: state.dailyTasks,
        totalPoints,
        activeTab: Vue.computed({
          get() { return activeTab.v; },
          set(v) { activeTab.v = v; }
        }),
        today,
        newRoleName,
        addRole,
        deleteRole,
        taskDefsByRole,
        taskHistoryStats,
        taskHistoryStatsReactive,
        isCompletedToday,
        openAddTaskModal,
        submitTask,
        deleteTaskDef,
        rewardsByRole,
        openAddRewardModal,
        submitReward,
        askRedeem,
        confirmRedeem,
        openConfirm,
        confirmAction,
        cancelConfirm,
        askComplete,
        confirmComplete,
        openImportModal,
        onImportFileChange,
        submitImport,
        exportData,
        calendar,
        prevMonth,
        nextMonth,
        goToday,
        openDaily,
        modals,
        taskForm,
        rewardForm,
        toggleTheme,
        themeLabel,
        notice,
        importForm,
        confirm
      };
    },
    mounted() {
      // 注册 Service Worker（HTTP 环境下有效）
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    }
  });

  const vm = app.mount('#app');
  // 暴露到全局，用于顶部 summary 简易绑定
  window.__APP__ = vm;
})();

