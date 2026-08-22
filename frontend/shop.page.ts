import $ from 'jquery';

// 1. 注入炫彩流光动画 CSS
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
  font-size: 12px;
  font-weight: 700;
  padding: 2px 8px;
  margin-left: 8px;
  border-radius: 12px;
  background: linear-gradient(135deg, #ff007f, #7928ca);
  color: #ffffff !important;
  box-shadow: 0 2px 6px rgba(255, 0, 127, 0.3);
}
</style>
`;

function injectRainbowStyle() {
  if (!$('#hydro-rainbow-style').length) {
    $('head').append(rainbowStyle);
  }
}

// 2. 右上角用户下拉菜单追加「积分商城」
function appendShopDropdownItem() {
  // 定位 HydroOJ 顶部导航栏用户下拉菜单
  const $userDropdown = $('a[href*="/setting"], a[href*="/logout"]').closest('.menu');
  
  if ($userDropdown.length && !$userDropdown.find('a[href="/shop"]').length) {
    const shopItemHtml = `
      <a class="item" href="/shop">
        <span class="icon icon-shopping_bag"></span> 🛍️ 积分商城
      </a>
    `;
    const $target = $userDropdown.find('a[href*="setting"], a[href*="logout"]').first();
    if ($target.length) {
      $target.before(shopItemHtml);
    } else {
      $userDropdown.append(shopItemHtml);
    }
  }
}

// 3. 个人主页渲染彩色用户名
function applyColorNameEffect() {
  // 匹配 /user/:uid 或 /d/:domain/user/:uid
  const userMatch = window.location.pathname.match(/\/user\/(\d+)/);
  if (!userMatch || !userMatch[1]) return;

  const targetUid = parseInt(userMatch[1], 10);

  fetch(`/api/shop/user_effect?uid=${targetUid}`)
    .then(res => res.json())
    .then(data => {
      if (data && data.isColorName) {
        // 匹配 HydroOJ 个人主页 (user_detail.html) 标题元素
        const $nameElem = $(
          '[data-page="user_detail"] h1.section__title, .section__header h1, h1.section__title, .user-profile h1'
        ).first();

        if ($nameElem.length && !$nameElem.hasClass('hydro-rainbow-uname')) {
          $nameElem.addClass('hydro-rainbow-uname');
          if (!$nameElem.next('.hydro-rainbow-tag').length) {
            $nameElem.after('<span class="hydro-rainbow-tag">🌈 炫彩名</span>');
          }
        }
      }
    })
    .catch(() => {});
}

// 统一执行函数
function run() {
  injectRainbowStyle();
  appendShopDropdownItem();
  applyColorNameEffect();
}

// 挂载执行并监听 PJAX 页面切换
$(() => {
  run();
  $(document).on('pjax:success pjax:end', run);
  window.addEventListener('pjax:success', run);
});