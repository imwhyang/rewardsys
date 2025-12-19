/**
 * 文件: daily.js
 * 描述: 每日详情页的数据访问与界面交互。
 */
(function () {
  const { createApp, reactive, computed } = Vue;

  /**
   * 工具: 解析查询字符串中的日期
   * @returns {string} YYYY-MM-DD
   */
  function getQueryDate() {
    const url = new URL(location.href);
    const d = url.searchParams.get('date');
    return d || new Date().toISOString().slice(0, 10);
  }

  /**
   * 类: DailyStoreReader
   * 职责: 只读访问 localStorage 中的数据。
   */
  class DailyStoreReader {
    constructor(storage, key = 'bleshi-points-data') {
      this.storage = storage;
      this.key = key;
      this.data = { roles: [], taskDefs: [], dailyTasks: {}, rewards: [] };
      this._load();
    }
    _load() {
      try {
        const raw = this.storage.getItem(this.key);
        if (raw) this.data = Object.assign(this.data, JSON.parse(raw));
      } catch {}
    }
    get roles() { return this.data.roles; }
    get taskDefs() { return this.data.taskDefs; }
    get dailyTasks() { return this.data.dailyTasks; }
    get rewards() { return this.data.rewards; }
  }

  /**
   * 类: DailyStoreWriter
   * 职责: 写入/更新每日任务、完成状态与删除操作。
   */
  class DailyStoreWriter extends DailyStoreReader {
    _save() {
      try {
        this.storage.setItem(this.key, JSON.stringify(this.data));
      } catch {}
    }
    /**
     * 补齐某日每日任务（根据 taskDefs）
     * @param {string} dateStr
     * @returns {Array}
     */
    ensureDaily(dateStr) {
      if (!this.data.dailyTasks[dateStr]) this.data.dailyTasks[dateStr] = [];
      
      // 1. 清理：移除未完成且不符合当前调度规则的任务（修复历史脏数据）
      const [y, m, d] = dateStr.split('-').map(Number);
      const dateObj = new Date(y, m - 1, d);
      const weekday = dateObj.getDay();
      const validTasks = [];
      for (const it of this.data.dailyTasks[dateStr]) {
        const td = this.data.taskDefs.find(t => t.id === it.taskDefId);
        // 如果找不到定义(已被删除)，保留或移除视需求而定。这里暂保留。
        if (!td) {
          validTasks.push(it);
          continue;
        }
        // 规则检查
        const untilOk = !td.repeatUntil || dateStr <= td.repeatUntil;
        let scheduled = true;
        const type = td.repeatType || 'daily';
        if (type === 'weekly') {
          const days = Array.isArray(td.repeatDays) ? td.repeatDays : [];
          scheduled = days.some(d => Number(d) === weekday);
        }
        
        // 如果已完成，或者符合规则，则保留
        if (it.completed || (untilOk && scheduled)) {
          validTasks.push(it);
        }
      }
      this.data.dailyTasks[dateStr] = validTasks;

      // 2. 补齐：添加符合规则但尚未存在的任务
      const list = this.data.dailyTasks[dateStr];
      const map = new Map(list.map(it => [it.taskDefId, it]));
      
      for (const td of this.data.taskDefs) {
        // 截止日期检查
        const untilOk = !td.repeatUntil || dateStr <= td.repeatUntil;
        // 重复频率检查
        let scheduled = true;
        const type = td.repeatType || 'daily';
        if (type === 'weekly') {
          const days = Array.isArray(td.repeatDays) ? td.repeatDays : [];
          // 兼容存储可能是字符串的情况，统一比较
          scheduled = days.some(d => Number(d) === weekday);
        }

        if (!untilOk || !scheduled) continue;

        if (!map.has(td.id)) {
          list.push({
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
      return list;
    }
    /**
     * 完成当日某任务并加积分
     * @param {string} dateStr
     * @param {string} taskDefId
     */
    complete(dateStr, taskDefId) {
      const list = this.ensureDaily(dateStr);
      const it = list.find(x => x.taskDefId === taskDefId);
      if (!it || it.completed) return;
      it.completed = true;
      it.completedAt = Date.now();
      const role = this.data.roles.find(r => r.id === it.roleId);
      if (role) role.points += (it.points || 0);
      this._save();
    }
    /**
     * 删除当日的某个任务实例（不影响任务定义）
     * @param {string} dateStr
     * @param {string} taskDefId
     */
    deleteDailyItem(dateStr, taskDefId) {
      const list = this.data.dailyTasks[dateStr] || [];
      const idx = list.findIndex(x => x.taskDefId === taskDefId);
      if (idx >= 0) {
        list.splice(idx, 1);
        if (list.length === 0) delete this.data.dailyTasks[dateStr];
        this._save();
      }
    }
    /**
     * 统计当日完成数与积分
     * @param {string} dateStr
     */
    dayStats(dateStr) {
      const list = this.data.dailyTasks[dateStr] || [];
      let completed = 0, points = 0;
      for (const it of list) {
        if (it.completed) { completed++; points += (it.points || 0); }
      }
      return { completed, points };
    }
    /**
     * 统计某角色当日积分
     * @param {string} dateStr
     * @param {string} roleId
     */
    roleDayPoints(dateStr, roleId) {
      const list = this.data.dailyTasks[dateStr] || [];
      return list.reduce((sum, it) => sum + ((it.roleId === roleId && it.completed) ? (it.points || 0) : 0), 0);
    }
  }

  const app = createApp({
    setup() {
      const dateStr = getQueryDate();
      const writer = new DailyStoreWriter(localStorage);
      // 补齐当日
      writer.ensureDaily(dateStr);
      const state = reactive(writer.data);
      const modals = reactive({ complete: false });
      const notice = reactive({ show: false, text: '' });
      const confirm = reactive({ show: false, title: '', message: '' });
      let confirmHandler = null;
      let completeTargetId = null;

      // 主题
      const themeKeyGlobal = 'bleshi-theme';
      const themeKeyDaily = 'bleshi-theme-daily';
      function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }
      function getTheme() { return localStorage.getItem(themeKeyDaily) || localStorage.getItem(themeKeyGlobal) || 'light'; }
      function setTheme(t) { localStorage.setItem(themeKeyDaily, t); applyTheme(t); }
      const themeLabel = Vue.computed(() => getTheme() === 'dark' ? '夜间' : '日间');
      function toggleTheme() { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }
      applyTheme(getTheme());

      const grouped = computed(() => {
        return state.roles.map(role => {
          const list = (state.dailyTasks[dateStr] || []).filter(it => it.roleId === role.id);
          return {
            role,
            items: list,
            roleDayPoints: writer.roleDayPoints(dateStr, role.id)
          };
        });
      });

      function completeItem(taskDefId) {
        writer.complete(dateStr, taskDefId);
      }
      /**
       * 打开完成确认
       * @param {string} taskDefId
       */
      function askComplete(taskDefId) {
        console.log('[daily.askComplete] clicked taskDefId=', taskDefId, 'date=', dateStr);
        completeTargetId = taskDefId;
        modals.complete = true;
      }
      /**
       * 确认完成并刷新统计
       */
      function confirmComplete() {
        console.log('[daily.confirmComplete] start taskDefId=', completeTargetId, 'date=', dateStr);
        if (!completeTargetId) { modals.complete = false; return; }
        writer.complete(dateStr, completeTargetId);
        modals.complete = false;
        completeTargetId = null;
        showNotice('已完成今日任务并增加积分');
        console.log('[daily.confirmComplete] end');
      }
      /**
       * 顶部提示
       * @param {string} text
       */
      function showNotice(text) {
        notice.text = text;
        notice.show = true;
        setTimeout(() => { notice.show = false; }, 2000);
      }
      function deleteItem(taskDefId) {
        console.log('[daily.deleteItem] clicked taskDefId=', taskDefId, 'date=', dateStr);
        openConfirm(
          '确认删除当日任务',
          '将删除今天的该任务实例，不影响任务定义。是否确认？',
          () => {
            writer.deleteDailyItem(dateStr, taskDefId);
            showNotice('已删除当日任务');
          }
        );
      }
      function openConfirm(title, message, handler) {
        confirm.title = title;
        confirm.message = message;
        confirmHandler = handler;
        confirm.show = true;
      }
      function confirmAction() {
        try { confirmHandler && confirmHandler(); } finally {
          confirm.show = false; confirmHandler = null;
        }
      }
      function cancelConfirm() {
        confirm.show = false; confirmHandler = null;
      }
      function goIndex() {
        location.href = './index.html?tab=calendar';
      }

      return {
        dateStr,
        roles: state.roles,
        grouped,
        dayStats: Vue.computed(() => writer.dayStats(dateStr)),
        completeItem,
        askComplete,
        confirmComplete,
        deleteItem,
        goIndex,
        toggleTheme,
        themeLabel,
        modals,
        notice,
        confirm,
        confirmAction,
        cancelConfirm
      };
    },
    mounted() {
      if ('serviceWorker' in navigator) {
        navigator.serviceWorker.register('./sw.js').catch(() => {});
      }
    }
  });

  app.mount('#daily-app');
})();

