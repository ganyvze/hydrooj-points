import $ from 'jquery';

$(() => {
  // 查找 Hydro 右上角用户下拉菜单
  const $userDropdown = $('.nav__user .dropdown .menu, .user-nav .dropdown .menu, #user-dropdown .menu');
  
  if ($userDropdown.length) {
    const shopItemHtml = `
      <a class="item" href="/shop">
        <i class="shopping bag icon"></i> 积分商城
      </a>
    `;
    
    // 优先插入在 "个人设置" 或 "退出登录" 之前
    const $target = $userDropdown.find('a[href*="setting"], a[href*="logout"]').first();
    if ($target.length) {
      $target.before(shopItemHtml);
    } else {
      $userDropdown.append(shopItemHtml);
    }
  }
});