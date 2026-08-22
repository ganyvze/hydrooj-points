import $ from 'jquery';
import { addPage, NamedPage, AutoloadPage } from '@hydrooj/ui-default';

// 1. 全局流光特效 CSS
const STYLE_ID = 'hydro-points-rainbow-style';
const rainbowCSS = `
@keyframes hydroRainbowFlow {
  0% { background-position: 0% 50%; }
  50% { background-position: 100% 50%; }
  100% { background-position: 0% 50%; }
}
/* 强力覆盖个人主页用户名及子元素 */
.hydro-rainbow-uname,
.hydro-rainbow-uname * {
  background: linear-gradient(135deg, #ff007f, #7928ca, #0070f3, #00dfd8, #ff007f, #f59e0b) !important;
  background-size: 300% 300% !important;
  -webkit-background-clip: text !important;
  -webkit-text-fill-color: transparent !important;
  animation: hydroRainbowFlow 4s ease infinite !important;
  font-weight: 800 !important;
  display: inline-block !important;
  text-shadow: none !important;
}
/* 炫彩名徽标标签 */
.hydro-rainbow-tag {
  display: inline-block !important;
  vertical-align: middle !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  padding: 2px 8px !important;
  margin-left: 10px !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #ff007f, #7928ca) !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  box-shadow: 0 2px 6px rgba(255, 0, 127, 0.35) !important;
}
`;

function injectRainbowCSS() {
  if (!document.getElementById(STYLE_ID)) {
    const style = document.createElement('style');
    style.id = STYLE_ID;
    style.innerHTML = rainbowCSS;
    document.head.appendChild(style);
  }
}

// 2. 渲染彩色用户名特效
function applyRainbowEffect() {
  injectRainbowCSS();

  // 获取当前个人主页的用户 UID
  let targetUid: number | null = null;
  const userMatch = window.location.pathname.match(/\/user\/(\d+)/);
  if (userMatch && userMatch[1]) {
    targetUid = parseInt(userMatch[1], 10);
  } else if ((window as any).UiContext?.udoc?._id) {
    targetUid = parseInt((window as any).UiContext.udoc._id, 10);
  }

  if (!targetUid || targetUid <= 1) return;

  // 请求后端特效生效状态
  fetch(`/api/shop/user_effect?uid=${targetUid}`)
    .then(res => res.json())
    .then(data => {
      if (data && data.isColorName) {
        // 全量匹配 HydroOJ 各版本中个人主页的用户名字段
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

        // 若 h1 内包裹了单独的用户名文字容器，则精准高亮该文字
        const $innerName = $target.find('.uname, .user-profile-name, span').not('.icon, .tag, .badge, img').first();
        const $elemToColor = $innerName.length ? $innerName : $target;

        if (!$elemToColor.hasClass('hydro-rainbow-uname')) {
          $elemToColor.addClass('hydro-rainbow-uname');
        }

        // 追加 🌈 炫彩名 徽标（防止重复添加）
        if (!$target.find('.hydro-rainbow-tag').length && !$target.next('.hydro-rainbow-tag').length) {
          $target.append('<span class="hydro-rainbow-tag">🌈 炫彩名</span>');
        }
      }
    })
    .catch(() => {});
}

// 3. 注册到 Hydro 官方生命周期（兼容初次加载与 PJAX 路由切换）
addPage(new NamedPage(['user_detail'], () => {
  applyRainbowEffect();
}));

addPage(new AutoloadPage('hydro_points_global', () => {
  injectRainbowCSS();
  if (window.location.pathname.includes('/user/')) {
    applyRainbowEffect();
  }
}));

// 原生事件兜底监听
$(() => {
  if (window.location.pathname.includes('/user/')) {
    applyRainbowEffect();
  }
});