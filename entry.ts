import $ from 'jquery';

// 注入炫彩流光动画 CSS
const rainbowStyle = `
<style id="hydro-rainbow-style">
@keyframes hydroRainbowFlow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
.hydro-rainbow-uname {
  background: linear-gradient(135deg, #ff007f, #7928ca, #0070f3, #00dfd8, #ff007f, #f59e0b) !important;
  background-size: 300% 300% !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  animation: hydroRainbowFlow 4s ease infinite !important;
  font-weight: 800 !important;
  display: inline-block !important;
  text-shadow: none !important;
}
.hydro-rainbow-tag {
  display: inline-block;
  vertical-align: middle;
  font-size: 11px;
  font-weight: 700;
  padding: 2px 8px;
  margin-left: 8px;
  border-radius: 12px;
  background: linear-gradient(135deg, #ff007f, #7928ca);
  color: #ffffff;
  box-shadow: 0 2px 6px rgba(255, 0, 127, 0.3);
}
</style>
`;

$(() => {
  // 1. 注入动画样式
  if (!$('#hydro-rainbow-style').length) {
    $('head').append(rainbowStyle);
  }

  // 2. 右上角用户下拉菜单追加「积分商城」
  const $userDropdown = $('.nav__user .dropdown .menu, .user-nav .dropdown .menu, #user-dropdown .menu');
  if ($userDropdown.length && !$userDropdown.find('a[href="/shop"]').length) {
    const shopItemHtml = `
      <a class="item" href="/shop">
        <i class="shopping bag icon"></i> 积分商城
      </a>
    `;
    const $target = $userDropdown.find('a[href*="setting"], a[href*="logout"]').first();
    if ($target.length) {
      $target.before(shopItemHtml);
    } else {
      $userDropdown.append(shopItemHtml);
    }
  }

  // 3. 检测是否在个人主页 (/user/:uid 或 /d/:domain/user/:uid)
  const userMatch = window.location.pathname.match(/\/user\/(\d+)/);
  if (userMatch && userMatch[1]) {
    const targetUid = parseInt(userMatch[1], 10);

    // 请求后端查询当前用户的装扮特效
    fetch(`/api/shop/user_effect?uid=${targetUid}`)
      .then(res => res.json())
      .then(data => {
        if (data && data.isColorName) {
          // 选中主页中的用户名标题元素
          const $nameElem = $(
            '.user-profile h1, .profile-header h1, h1.user-profile__header, .profile-name, h1.ui.header'
          ).first();

          if ($nameElem.length) {
            $nameElem.addClass('hydro-rainbow-uname');
            $nameElem.after('<span class="hydro-rainbow-tag">🌈 炫彩名</span>');
          }
        }
      })
      .catch(() => {});
  }
});