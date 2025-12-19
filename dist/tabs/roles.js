/**
 * 文件: tabs/roles.js
 * 描述: 角色页签相关逻辑
 */
export function createRolesModule(state, store) {
  /**
   * 根据角色添加
   * @param {string} name
   */
  function addRole(name) {
    store.addRole(name);
  }
  /**
   * 删除角色
   * @param {string} roleId
   */
  function deleteRole(roleId) {
    store.deleteRole(roleId);
  }
  return { addRole, deleteRole };
}

