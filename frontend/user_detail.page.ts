import $ from 'jquery';
import { addPage, NamedPage, AutoloadPage } from '@hydrooj/ui-default';

// 1. 全局流光特效与自闭状态 CSS
const STYLE_ID = 'hydro-points-user-effect-style';
const effectCSS = `
/* 循环平滑无缝滚动动画 */
@keyframes hydroRainbowFlow {
  0% { background-position: 0% center; }
  100% { background-position: -200% center; }
}

/* 炫彩用户名流光样式 */
.hydro-rainbow-uname,
.hydro-rainbow-uname * {
  background: linear-gradient(
    to right,
    #ff3333 0%,
    #ffb300 25%,
    #00cc66 50%,
    #0088ff 75%,
    #ff3333 100%
  ) !important;
  background-size: 200% auto !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  animation: hydroRainbowFlow 3s linear infinite !important;
  font-weight: 800 !important;
  display: inline-block !important;
  text-shadow: none !important;
}

/* 🌈 炫彩名徽标 */
.hydro-rainbow-tag {
  display: inline-block !important;
  vertical-align: middle !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  padding: 2px 8px !important;
  margin-left: 10px !important;
  border-radius: 12px !important;
  background: linear-gradient(to right, #ff3333, #ffb300, #00cc66, #0088ff) !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  box-shadow: 0 2px 6px rgba(0, 204, 102, 0.35) !important;
}

/* 🤐 自闭中徽标 (自己访问可见) */
.hydro-solitude-tag {
  display: inline-block !important;
  vertical-align: middle !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  padding: 2px 8px !important;
  margin-left: 10px !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #64748b 0%, #334155 100%) !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  box-shadow: 0 2px 6px rgba(51, 65, 85, 0.4) !important;
}
`;

function injectEffectCSS() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.innerHTML = effectCSS;
    document.head.appendChild(style);
  }
}

// 2. 渲染特效及自闭状态
function applyUserEffects() {
  injectEffectCSS();

  // 获取当前主页的用户 UID
  let targetUid: number | null = null;
  const userMatch = window.location.pathname.match(/\/user\/(\d+)/);
  if (userMatch && userMatch[1]) {
    targetUid = parseInt(userMatch[1], 10);
  } else if ((window as any).UiContext?.udoc?._id) {
    targetUid = parseInt((window as any).UiContext.udoc._id, 10);
  }

  if (!targetUid || targetUid <= 1) return;

  // 请求后端生效状态
  fetch(`/api/shop/user_effect?uid=${targetUid}`)
    .then(res => res.json())
    .then(data => {
      if (!data) return;

      const selectors = [
        '[data-page="user_detail"] .section__header h1',
        '[data-page="user_detail"] h1.section__title',
        '[data-page="user_detail"] .profile-header__main h1',
        '[data-page="user_detail"] .user-profile-name',
        '.section__header h1',
        'h1.section__title',
        '.profile-header__main h1'
      ];

      let $target = $(selectors.join(', ')).first();
      if (!$target.length) return;

      // 1. 自闭卡生效状态展示
      if (data.isSolitude) {
        if (!$target.find('.hydro-solitude-tag').length && !$target.next('.hydro-solitude-tag').length) {
          $target.append('<span class="hydro-solitude-tag">🤐 自闭中</span>');
        }
      }

      // 2. 彩色用户名流光特效
      if (data.isColorName) {
        const $innerName = $target.find('.uname, .user-profile-name, span').not('.icon, .tag, .badge, img').first();
        const $elemToColor = $innerName.length ? $innerName : $target;

        if (!$elemToColor.hasClass('hydro-rainbow-uname')) {
          $elemToColor.addClass('hydro-rainbow-uname');
        }

        if (!$target.find('.hydro-rainbow-tag').length && !$target.next('.hydro-rainbow-tag').length) {
          $target.append('<span class="hydro-rainbow-tag">🌈 炫彩名</span>');
        }
      }
    })
    .catch(() => {});
}

// 3. 注册到 Hydro 官方生命周期
addPage(new NamedPage(['user_detail'], () => {
  applyUserEffects();
}));

addPage(new AutoloadPage('hydro_points_global', () => {
  injectEffectCSS();
  if (window.location.pathname.includes('/user/')) {
    applyUserEffects();
  }
}));

$(() => {
  if (window.location.pathname.includes('/user/')) {
    applyUserEffects();
  }
});