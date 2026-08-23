import $ from 'jquery';
import { NamedPage } from 'vj/misc/Page';
import Notification from 'vj/components/notification';
import { request } from 'vj/utils';
import i18n from 'vj/utils/i18n';

const page = new NamedPage(['user_detail'], () => {
  // 检查用户是否有改名卡权限
  function checkRenameCardPermission() {
    return fetch('/api/shop/user_effect')
      .then(res => res.json())
      .then(data => data.isRenameCard)
      .catch(() => false);
  }

  // 显示修改用户名对话框
  function showRenameDialog() {
    checkRenameCardPermission().then(hasPermission => {
      if (!hasPermission) {
        Notification.error('你没有改名卡权限，请先购买改名卡');
        return;
      }

      const currentUsername = $('.section__header h1').text().trim();
      const dialog = $(`
        <div class="dialog-overlay">
          <div class="dialog">
            <h3>修改用户名</h3>
            <p>当前用户名：<strong>${currentUsername}</strong></p>
            <div class="form-group">
              <label>新用户名：</label>
              <input type="text" id="new-username" class="input" placeholder="请输入新的用户名" maxlength="20">
              <small class="help-text">用户名长度限制：3-20个字符</small>
            </div>
            <div class="dialog-buttons">
              <button class="button secondary" onclick="$('.dialog-overlay').remove()">取消</button>
              <button class="button primary" onclick="handleRenameConfirm()">确认修改</button>
            </div>
          </div>
        </div>
      `);

      // 添加样式
      const style = $(`
        <style>
          .dialog-overlay {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: rgba(0, 0, 0, 0.5);
            display: flex;
            align-items: center;
            justify-content: center;
            z-index: 10000;
          }
          .dialog {
            background: white;
            border-radius: 8px;
            padding: 24px;
            max-width: 400px;
            width: 90%;
            box-shadow: 0 4px 20px rgba(0, 0, 0, 0.15);
          }
          .dialog h3 {
            margin: 0 0 16px 0;
            color: #333;
            font-size: 18px;
          }
          .form-group {
            margin-bottom: 16px;
          }
          .form-group label {
            display: block;
            margin-bottom: 8px;
            font-weight: 600;
            color: #555;
          }
          .input {
            width: 100%;
            padding: 8px 12px;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 14px;
            box-sizing: border-box;
          }
          .input:focus {
            outline: none;
            border-color: #4f46e5;
          }
          .help-text {
            display: block;
            margin-top: 4px;
            font-size: 12px;
            color: #666;
          }
          .dialog-buttons {
            display: flex;
            gap: 8px;
            justify-content: flex-end;
            margin-top: 20px;
          }
          .button {
            padding: 8px 16px;
            border: none;
            border-radius: 4px;
            font-size: 14px;
            cursor: pointer;
            font-weight: 600;
          }
          .button.secondary {
            background: #e5e7eb;
            color: #374151;
          }
          .button.secondary:hover {
            background: #d1d5db;
          }
          .button.primary {
            background: #4f46e5;
            color: white;
          }
          .button.primary:hover {
            background: #4338ca;
          }
        </style>
      `);

      $('head').append(style);
      $('body').append(dialog);
    });
  }

  // 处理用户名修改确认
  window.handleRenameConfirm = function() {
    const newUsername = $('#new-username').val().trim();
    
    if (!newUsername) {
      Notification.error('用户名不能为空');
      return;
    }

    if (newUsername.length < 3 || newUsername.length > 20) {
      Notification.error('用户名长度必须在3-20个字符之间');
      return;
    }

    // 检查用户名格式
    const usernameRegex = /^[a-zA-Z0-9_-]+$/;
    if (!usernameRegex.test(newUsername)) {
      Notification.error('用户名只能包含字母、数字、下划线和连字符');
      return;
    }

    // 再次检查权限
    checkRenameCardPermission().then(hasPermission => {
      if (!hasPermission) {
        Notification.error('你没有改名卡权限，请先购买改名卡');
        $('.dialog-overlay').remove();
        return;
      }

      // 发送修改请求
      fetch('/api/user/set_uname', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          uname: newUsername
        })
      })
      .then(res => res.json())
      .then(data => {
        $('.dialog-overlay').remove();
        
        if (data.success) {
          Notification.success('用户名修改成功！');
          // 刷新页面以显示新用户名
          setTimeout(() => {
            window.location.reload();
          }, 1000);
        } else {
          Notification.error(data.message || '用户名修改失败');
        }
      })
      .catch(error => {
        $('.dialog-overlay').remove();
        Notification.error('网络错误，请重试');
      });
    });
  };

  // 添加改名按钮到用户页面
  function addRenameButton() {
    if ($('.rename-user-btn').length) return; // 避免重复添加

    const $header = $('.section__header h1, .section__header .section__title');
    if ($header.length) {
      const $renameBtn = $(`
        <button class="button secondary rename-user-btn" style="margin-left: 12px; padding: 6px 12px; font-size: 13px;">
          🔄 修改用户名
        </button>
      `);
      
      $header.after($renameBtn);
      
      $renameBtn.on('click', function(e) {
        e.preventDefault();
        e.stopPropagation();
        showRenameDialog();
      });
    }
  }

  // 初始化
  addRenameButton();

  // 监听页面变化（SPA导航）
  let observer = new MutationObserver(function(mutations) {
    let shouldAddButton = false;
    mutations.forEach(function(mutation) {
      if (mutation.type === 'childList') {
        mutation.addedNodes.forEach(function(node) {
          if (node.nodeType === 1) { // 元素节点
            if ($(node).is('.section__header') || $(node).find('.section__header').length) {
              shouldAddButton = true;
            }
          }
        });
      }
    });
    
    if (shouldAddButton) {
      setTimeout(addRenameButton, 100);
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });

  // 清理观察器
  $(window).on('beforeunload', function() {
    observer.disconnect();
  });
});

export default page;