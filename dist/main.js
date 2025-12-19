import { PointsStore, formatDate } from './lib/store.js';
import { createRolesModule } from './tabs/roles.js';
import { createTasksModule } from './tabs/tasks.js';
import { createRewardsModule } from './tabs/rewards.js';
import { createCalendarModule } from './tabs/calendar.js';

const { createApp, reactive, computed, toRefs } = Vue;

const store = new PointsStore(localStorage);
const state = reactive(store.data);

const app = createApp({
  setup() {
    const today = formatDate(new Date());
    const url = new URL(location.href);
    const initTab = url.searchParams.get('tab') || 'roles';
    const activeTab = reactive({ v: initTab });

    const modals = reactive({ addTask: false, addReward: false, importData: false });
    const confirm = reactive({ show: false, title: '', message: '' });
    const notice = reactive({ show: false, text: '' });
    let confirmHandler = null;

    const taskForm = reactive({ roleId: '', title: '', points: 1, note: '', repeatType: 'daily', repeatDays: [], repeatUntil: '', priority: 'medium' });
    const rewardForm = reactive({ roleId: '', title: '', cost: 1, note: '' });
    const importForm = reactive({ text: '', fileText: '' });
    const newRoleName = reactive({ v: '' });
    let editingTaskId = null;

    const totalPoints = computed(() => state.roles.reduce((sum, r) => sum + (r.points || 0), 0));

    const { addRole, deleteRole } = createRolesModule(state, store);
    const { calendar, rebuildCalendar, prevMonth, nextMonth, goToday, openDaily } = createCalendarModule(store);
    const tasks = createTasksModule(state, store, today, rebuildCalendar, showNotice);
    const rewards = createRewardsModule(state, store, showNotice);

    function openAddTaskModal() {
      modals.addTask = true;
      editingTaskId = null;
      taskForm.roleId = state.roles[0]?.id || '';
      taskForm.title = '';
      taskForm.points = 1;
      taskForm.note = '';
      taskForm.repeatType = 'daily';
      taskForm.repeatDays = [];
      taskForm.repeatUntil = '';
      taskForm.priority = 'medium';
    }
    /**
     * 函数: openEditTask
     * 作用: 打开任务编辑弹窗并填充数据
     * @param {object} td
     */
    function openEditTask(td) {
      modals.addTask = true;
      editingTaskId = td.id;
      taskForm.roleId = td.roleId;
      taskForm.title = td.title;
      taskForm.points = td.points;
      taskForm.note = td.note || '';
      taskForm.repeatType = td.repeatType || 'daily';
      taskForm.repeatDays = Array.isArray(td.repeatDays) ? td.repeatDays.slice() : [];
      taskForm.repeatUntil = td.repeatUntil || '';
      taskForm.priority = td.priority || 'medium';
    }
    /**
     * 函数: submitTask
     * 作用: 从“添加任务”弹窗直接提交任务定义（不再二次确认）
     */
    function submitTask() {
      if (!taskForm.roleId || !taskForm.title || taskForm.points <= 0) return;
      if (editingTaskId) {
        // 编辑模式：更新任务定义
        store.updateTaskDef(editingTaskId, {
          roleId: taskForm.roleId,
          title: taskForm.title,
          points: taskForm.points,
          note: taskForm.note,
          repeatType: taskForm.repeatType,
          repeatDays: taskForm.repeatDays,
          repeatUntil: taskForm.repeatUntil || null,
          priority: taskForm.priority
        });
        // 同步UI数据源
        state.taskDefs = [...store.data.taskDefs];
        // 受重复规则影响，补齐今日每日记录
        store.ensureDaily(today);
        rebuildCalendar();
        modals.addTask = false;
        editingTaskId = null;
        showNotice('已更新任务定义');
      } else {
        // 新增模式
        store.addTaskDef(
          taskForm.roleId,
          taskForm.title,
          taskForm.points,
          taskForm.note,
          taskForm.repeatType,
          taskForm.repeatDays,
          taskForm.repeatUntil || null,
          taskForm.priority
        );
        // 新增后补齐今日每日记录，便于立即完成
        store.ensureDaily(today);
        rebuildCalendar();
        modals.addTask = false;
        showNotice('已添加任务定义');
      }
    }

    function openAddRewardModal() {
      modals.addReward = true;
      rewardForm.roleId = state.roles[0]?.id || '';
      rewardForm.title = '';
      rewardForm.cost = 1;
      rewardForm.note = '';
    }
    /**
     * 函数: submitReward
     * 作用: 从“添加奖励”弹窗直接提交奖励（不再二次确认）
     */
    function submitReward() {
      if (!rewardForm.roleId || !rewardForm.title || rewardForm.cost <= 0) return;
      store.addReward(rewardForm.roleId, rewardForm.title, rewardForm.cost, rewardForm.note);
      modals.addReward = false;
      showNotice('已添加奖励');
    }

    function showNotice(text) {
      notice.text = text;
      notice.show = true;
      setTimeout(() => { notice.show = false; }, 2000);
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

    function askComplete(taskDefId) {
      openConfirm(
        '确认完成',
        '将记录该任务今日完成并为角色增加积分。是否确认？',
        () => tasks.completeToday(taskDefId)
      );
    }
    function askRedeem(rewardId) {
      console.log('[askRedeem] click rewardId=', rewardId);
      const rw = state.rewards.find(r => r.id === rewardId);
      const roleName = rw ? (state.roles.find(r => r.id === rw.roleId)?.name || '') : '';
      const msg = rw ? `角色：${roleName}，奖励：${rw.title}，所需积分：${rw.cost}。是否确认兑换？` : '是否确认兑换该奖励？';
      openConfirm('确认兑换', msg, () => { rewards.redeemReward(rewardId); });
      setTimeout(() => {
        const hasModal = !!document.querySelector('.modal');
        if (!hasModal) {
          if (window.confirm(msg)) { rewards.redeemReward(rewardId); }
        }
      }, 0);
    }
    function deleteTaskDef(taskDefId) {
      openConfirm(
        '确认删除任务',
        '将删除该任务定义并清理所有每日记录。是否确认？',
        () => tasks.deleteTaskDef(taskDefId)
      );
    }
    function addRoleWithConfirm() {
      const name = newRoleName.v.trim();
      if (!name) return;
      const msg = `角色名称：${name}。是否确认添加？`;
      openConfirm('确认添加角色', msg, () => {
        addRole(name);
        console.log('[roles] added:', name);
        newRoleName.v = '';
        state.roles = [...store.data.roles];
        store.ensureDaily(today);
        rebuildCalendar();
        showNotice('已添加角色');
      });
    }
    function deleteRoleWithConfirm(roleId) {
      const roleName = state.roles.find(r => r.id === roleId)?.name || '';
      const msg = `将删除角色“${roleName}”及其任务定义、奖励与每日记录。是否确认？`;
      openConfirm('确认删除角色', msg, () => {
        deleteRole(roleId);
        console.log('[roles] deleted:', roleId, roleName);
        state.roles = [...store.data.roles];
        state.taskDefs = [...store.data.taskDefs];
        state.rewards = [...store.data.rewards];
        state.dailyTasks = store.data.dailyTasks;
        store.ensureDaily(today);
        rebuildCalendar();
        showNotice('已删除角色及相关数据');
      });
    }

    const themeKey = 'bleshi-theme';
    function applyTheme(t) { document.documentElement.setAttribute('data-theme', t); }
    function getTheme() { return localStorage.getItem(themeKey) || 'light'; }
    function setTheme(t) { localStorage.setItem(themeKey, t); applyTheme(t); }
    const themeLabel = computed(() => getTheme() === 'dark' ? '夜间' : '日间');
    function toggleTheme() { setTheme(getTheme() === 'dark' ? 'light' : 'dark'); }
    applyTheme(getTheme());

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
      openConfirm(
        '确认导入数据',
        '导入将覆盖当前数据，且无法撤销。是否确认导入？',
        () => {
          try {
            const parsed = JSON.parse(raw);
            store.setData(parsed);
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
      );
    }
    function exportData() {
      openConfirm(
        '确认导出数据',
        '将导出当前全部数据为JSON文件。是否确认导出？',
        () => {
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
      );
    }

    store.ensureDaily(today);

      return {
      ...toRefs(state),
      totalPoints,
      activeTab: Vue.computed({
        get() { return activeTab.v; },
        set(v) { activeTab.v = v; }
      }),
      today,
      newRoleName,
      addRole: addRoleWithConfirm,
      deleteRole: deleteRoleWithConfirm,
      taskDefsByRole: tasks.taskDefsByRole,
      taskHistoryStatsReactive: tasks.taskHistoryStatsReactive,
      isCompletedToday: tasks.isCompletedToday,
      openEditTask,
      askComplete,
      deleteTaskDef,
      rewardsByRole: rewards.rewardsByRole,
      openAddRewardModal,
      submitReward,
      askRedeem,
      calendar,
      prevMonth,
      nextMonth,
      goToday,
      openDaily,
      openAddTaskModal,
      submitTask,
      openImportModal,
      onImportFileChange,
      submitImport,
      exportData,
      modals,
      taskForm,
      rewardForm,
      toggleTheme,
      themeLabel,
      notice,
      importForm,
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

const vm = app.mount('#app');
window.__APP__ = vm;

