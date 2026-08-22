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

function applyColorNameEffect() {
  const userMatch = window.location.pathname.match(/\/user\/(\d+)/);
  if (!userMatch || !userMatch[1]) return;

  const targetUid = parseInt(userMatch[1], 10);

  fetch(`/api/shop/user_effect?uid=${targetUid}`)
    .then(res => res.json())
    .then(data => {
      if (data && data.isColorName) {
        // 查找 HydroOJ 个人主页标题元素
        const $header = $(
          '[data-page="user_detail"] .section__header h1, [data-page="user_detail"] h1.section__title, .section__header h1, h1.section__title'
        ).first();

        if ($header.length) {
          // 排除 avatar 图片，直接高亮用户名
          const $nameText = $header.find('.user-profile-name, .uname').first();
          if ($nameText.length) {
            $nameText.addClass('hydro-rainbow-uname');
          } else {
            $header.addClass('hydro-rainbow-uname');
          }

          // 避免重复追加炫彩名标签
          if (!$header.find('.hydro-rainbow-tag').length && !$header.next('.hydro-rainbow-tag').length) {
            $header.append('<span class="hydro-rainbow-tag">🌈 炫彩名</span>');
          }
        }
      }
    })
    .catch(() => {});
}

// 统一渲染入口
function render() {
  injectRainbowStyle();
  applyColorNameEffect();
}

// 在 user_detail 页面加载或 PJAX 切换时执行
$(() => {
  render();
  $(document).on('pjax:success pjax:end', render);
  window.addEventListener('pjax:success', render);
});