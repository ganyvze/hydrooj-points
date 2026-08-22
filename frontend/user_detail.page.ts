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

/* 🥚 彩蛋徽标 */
.hydro-egg-tag {
  display: inline-block !important;
  vertical-align: middle !important;
  font-size: 12px !important;
  font-weight: 700 !important;
  line-height: 1.4 !important;
  padding: 2px 8px !important;
  margin-left: 10px !important;
  border-radius: 12px !important;
  background: linear-gradient(135deg, #0d9488 0%, #0284c7 100%) !important;
  color: #ffffff !important;
  -webkit-text-fill-color: #ffffff !important;
  box-shadow: 0 2px 6px rgba(13, 148, 136, 0.35) !important;
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

// 2. 彩蛋核心文案魔改映射表 (同时兼容英文与中文环境)
const STATUS_REPLACEMENTS: [RegExp, string][] = [
  [/\bAccepted\b/g, 'Answer Coarse'],
  [/\bWrong Answer\b/g, 'Wonderful Answer'],
  [/\bTime Limit Exceeded\b/g, 'Time Limit Enough'],
  [/\bMemory Limit Exceeded\b/g, 'Memory Limit Enough'],
  [/\bCompile Error\b/g, 'Compile Excellent'],
  [/\bRuntime Error\b/g, 'Runtime Excellent'],
  [/通过/g, 'Answer Coarse'],
  [/答案错误/g, 'Wonderful Answer'],
  [/时间超限/g, 'Time Limit Enough'],
  [/内存超限/g, 'Memory Limit Enough'],
  [/编译错误/g, 'Compile Excellent'],
  [/运行错误/g, 'Runtime Excellent'],
];

function replaceStatusTextInNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) {
    let text = node.nodeValue;
    if (!text || !text.trim()) return;

    const parentTag = node.parentElement?.tagName;
    if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'TEXTAREA' || parentTag === 'INPUT') return;

    let modified = false;
    for (const [regex, replacement] of STATUS_REPLACEMENTS) {
      if (regex.test(text)) {
        text = text.replace(regex, replacement);
        modified = true;
      }
    }
    if (modified) {
      node.nodeValue = text;
    }
  } else if (node.nodeType === Node.ELEMENT_NODE) {
    const el = node as HTMLElement;
    if (el.tagName === 'SCRIPT' || el.tagName === 'STYLE' || el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') return;
    for (let i = 0; i < el.childNodes.length; i++) {
      replaceStatusTextInNode(el.childNodes[i]);
    }
  }
}

let eggObserver: MutationObserver | null = null;

function enableEasterEggEffect() {
  replaceStatusTextInNode(document.body);

  if (eggObserver) {
    eggObserver.disconnect();
  }

  eggObserver = new MutationObserver((mutations) => {
    eggObserver?.disconnect();
    for (const mutation of mutations) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach((n) => replaceStatusTextInNode(n));
      } else if (mutation.type === 'characterData' && mutation.target) {
        replaceStatusTextInNode(mutation.target);
      }
    }
    eggObserver?.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  });

  eggObserver.observe(document.body, {
    childList: true,
    subtree: true,
    characterData: true,
  });
}

// 3. 检查当前用户的彩蛋状态与个人主页特效
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

  // 1. 请求当前登录用户效果（检查彩蛋）
  fetch('/api/shop/user_effect')
    .then((res) => res.json())
    .then((data) => {
      if (data && data.isEasterEgg) {
        enableEasterEggEffect();
      }
    })
    .catch(() => {});

  // 2. 如果在用户主页，渲染个人主页特效
  if (targetUid && targetUid > 1) {
    fetch(`/api/shop/user_effect?uid=${targetUid}`)
      .then((res) => res.json())
      .then((data) => {
        if (!data) return;

        const selectors = [
          '[data-page="user_detail"] .section__header h1',
          '[data-page="user_detail"] h1.section__title',
          '[data-page="user_detail"] .profile-header__main h1',
          '[data-page="user_detail"] .user-profile-name',
          '.section__header h1',
          'h1.section__title',
          '.profile-header__main h1',
        ];

        const $target = $(selectors.join(', ')).first();
        if (!$target.length) return;

        // 自闭卡生效状态展示
        if (data.isSolitude) {
          if (!$target.find('.hydro-solitude-tag').length && !$target.next('.hydro-solitude-tag').length) {
            $target.append('<span class="hydro-solitude-tag">🤐 自闭中</span>');
          }
        }

        // 彩色用户名流光特效
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
}

// 4. 注册到 HydroOJ 官方生命周期
addPage(new NamedPage(['user_detail'], () => {
  applyUserEffects();
}));

addPage(new AutoloadPage('hydro_points_global', () => {
  applyUserEffects();
}));

$(() => {
  applyUserEffects();
});