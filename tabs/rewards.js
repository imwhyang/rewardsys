/**
 * 文件: tabs/rewards.js
 * 描述: 奖励页签相关逻辑
 */
export function createRewardsModule(state, store, showNotice) {
  /**
   * 获取角色下的奖励列表
   * @param {string} roleId
   */
  function rewardsByRole(roleId) {
    return state.rewards.filter(rw => rw.roleId === roleId);
  }
  /**
   * 兑换奖励
   * @param {string} rewardId
   */
  function redeemReward(rewardId) {
    const ok = store.redeemReward(rewardId);
    if (ok) {
      showNotice && showNotice('兑换成功，积分已扣减');
    } else {
      showNotice && showNotice('兑换失败：积分不足或奖励不存在');
    }
    return ok;
  }
  return { rewardsByRole, redeemReward };
}

