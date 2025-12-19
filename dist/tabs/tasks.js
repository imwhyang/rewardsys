/**
 * 文件: tabs/tasks.js
 * 描述: 任务页签相关逻辑
 */
export function createTasksModule(state, store, today, rebuildCalendar, showNotice) {
  /**
   * 获取角色下的任务定义
   * @param {string} roleId
   */
  function taskDefsByRole(roleId) {
    const list = state.taskDefs.filter(td => td.roleId === roleId);
    const order = { high: 0, medium: 1, low: 2 };
    return list.slice().sort((a, b) => {
      const pa = order[a.priority || 'medium'];
      const pb = order[b.priority || 'medium'];
      if (pa !== pb) return pa - pb;
      return a.title.localeCompare(b.title);
    });
  }
  /**
   * 历史统计（非响应式）
   * @param {string} taskDefId
   */
  function taskHistoryStats(taskDefId) {
    return store.getTaskHistoryStats(taskDefId);
  }
  /**
   * 历史统计（响应式）
   * @param {string} taskDefId
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
   * 判断今日是否完成
   * @param {string} taskDefId
   */
  function isCompletedToday(taskDefId) {
    const list = state.dailyTasks[today] || [];
    return !!list.find(it => it.taskDefId === taskDefId && it.completed);
  }
  /**
   * 完成今日任务（统一弹窗确认在外部触发）
   * @param {string} taskDefId
   */
  function completeToday(taskDefId) {
    store.completeTask(taskDefId, today);
    rebuildCalendar();
    showNotice && showNotice('已完成今日任务并增加积分');
  }
  /**
   * 删除任务定义
   * @param {string} taskDefId
   */
  function deleteTaskDef(taskDefId) {
    store.deleteTaskDef(taskDefId);
    rebuildCalendar();
    showNotice && showNotice('已删除任务定义并清理每日记录');
  }
  return {
    taskDefsByRole,
    taskHistoryStats,
    taskHistoryStatsReactive,
    isCompletedToday,
    completeToday,
    deleteTaskDef
  };
}
