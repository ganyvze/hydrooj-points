import {
  Context, Handler, param, PRIV, Types, UserModel, DomainModel,
  ValidationError, UserNotFoundError, PermissionError, SystemModel,
  moment, ProblemModel, MessageModel, STATUS, db
} from 'hydrooj';

// 默认配置常量
const DEFAULT_BOX_PRICE = 199;
const DEFAULT_COLOR_NAME_PRICE = 299;
const DEFAULT_BOX_PRIZES = [
  { name: '特等奖', points: 1999, weight: 10,  badge: 'gold' },
  { name: '一等奖', points: 888,  weight: 40,  badge: 'purple' },
  { name: '二等奖', points: 399,  weight: 158, badge: 'blue' },
  { name: '保本奖', points: 199,  weight: 192, badge: 'gray' },
  { name: '回血奖', points: 99,   weight: 380, badge: 'gray' },
  { name: '小亏奖', points: 66,   weight: 70,  badge: 'gray' },
  { name: '谢谢惠顾', points: 0,    weight: 150, badge: 'gray' },
];

// 获取系统中的商城与盲盒动态配置
async function getShopConfig() {
  const boxPrice = (await SystemModel.get('points.box_price')) ?? DEFAULT_BOX_PRICE;
  const colorNamePrice = (await SystemModel.get('points.color_name_price')) ?? DEFAULT_COLOR_NAME_PRICE;
  const boxPrizes = (await SystemModel.get('points.box_prizes')) ?? DEFAULT_BOX_PRIZES;
  return { boxPrice, colorNamePrice, boxPrizes };
}

// 动态权重抽奖算法
function rollMysteryBox(prizes: Array<{ points: number; weight: number }>): number {
  const totalWeight = prizes.reduce((acc, p) => acc + (p.weight || 0), 0);
  if (totalWeight <= 0) return 0;
  const rand = Math.floor(Math.random() * totalWeight);
  let accumulated = 0;
  for (const prize of prizes) {
    accumulated += prize.weight;
    if (rand < accumulated) return prize.points;
  }
  return 0;
}

// 1. 商城前台页面处理器
class ShopHandler extends Handler {
  async get() {
    if (!this.user._id || this.user._id <= 1) {
      this.response.redirect = '/login';
      return;
    }
    const udoc = await db.collection('user').findOne({ _id: this.user._id });
    const { boxPrice, colorNamePrice, boxPrizes } = await getShopConfig();

    const totalWeight = boxPrizes.reduce((sum, p) => sum + (p.weight || 0), 0) || 1000;
    const prizesWithRatio = boxPrizes.map(p => ({
      ...p,
      ratio: ((p.weight / totalWeight) * 100).toFixed(1),
    }));

    this.response.template = 'shop.html';
    this.response.body = {
      userPoints: udoc?.points || 0,
      colorNameExpire: udoc?.colorNameExpire || null,
      boxPrice,
      colorNamePrice,
      boxPrizes: prizesWithRatio,
    };
  }
}

// 2. 盲盒购买 API（采用动态价格与爆率）
class BuyBoxHandler extends Handler {
  async post() {
    const uid = this.user._id;
    if (!uid || uid <= 1) throw new PermissionError('请先登录');

    const { boxPrice, boxPrizes } = await getShopConfig();

    // 原子扣除积分
    const deductRes = await db.collection('user').updateOne(
      { _id: uid, points: { $gte: boxPrice } },
      { $inc: { points: -boxPrice } }
    );

    if (deductRes.matchedCount === 0) {
      this.response.body = { error: `积分不足 ${boxPrice}，无法开启盲盒` };
      return;
    }

    const reward = rollMysteryBox(boxPrizes);
    if (reward > 0) {
      await db.collection('user').updateOne(
        { _id: uid },
        { $inc: { points: reward } }
      );
    }

    await db.collection('point_log').insertOne({
      uid,
      type: 'shop_mystery_box',
      cost: boxPrice,
      reward,
      net: reward - boxPrice,
      createdAt: new Date(),
    });

    const updatedUser = await db.collection('user').findOne({ _id: uid });
    this.response.body = {
      reward,
      userPoints: updatedUser?.points || 0,
    };
  }
}

// 3. 购买彩色用户名 API
class BuyColorNameHandler extends Handler {
  async post() {
    const uid = this.user._id;
    if (!uid || uid <= 1) throw new PermissionError('请先登录');

    const { colorNamePrice } = await getShopConfig();

    // 原子扣费
    const deductRes = await db.collection('user').updateOne(
      { _id: uid, points: { $gte: colorNamePrice } },
      { $inc: { points: -colorNamePrice } }
    );

    if (deductRes.matchedCount === 0) {
      this.response.body = { error: `积分不足 ${colorNamePrice}，无法兑换` };
      return;
    }

    // 计算到期时间（已有时间则叠加 24 小时）
    const now = Date.now();
    const udoc = await db.collection('user').findOne({ _id: uid });
    let baseTime = now;
    if (udoc?.colorNameExpire && new Date(udoc.colorNameExpire).getTime() > now) {
      baseTime = new Date(udoc.colorNameExpire).getTime();
    }
    const expireAt = new Date(baseTime + 24 * 60 * 60 * 1000);

    await db.collection('user').updateOne(
      { _id: uid },
      { $set: { colorNameExpire: expireAt } }
    );

    await db.collection('point_log').insertOne({
      uid,
      type: 'shop_buy_color_name',
      cost: colorNamePrice,
      durationDays: 1,
      expireAt,
      createdAt: new Date(),
    });

    const updatedUser = await db.collection('user').findOne({ _id: uid });
    this.response.body = {
      success: true,
      userPoints: updatedUser?.points || 0,
      colorNameExpire: expireAt,
    };
  }
}

// 4. 用户主页特效查询 API
class UserEffectHandler extends Handler {
  async get() {
    const targetUid = parseInt(this.request.query.uid as string, 10);
    if (!targetUid || targetUid <= 1) {
      this.response.body = { isColorName: false };
      return;
    }

    const udoc = await db.collection('user').findOne({ _id: targetUid });
    const now = Date.now();
    const isColorName = !!(udoc?.colorNameExpire && new Date(udoc.colorNameExpire).getTime() > now);

    this.response.body = {
      isColorName,
      expireAt: udoc?.colorNameExpire || null,
    };
  }
}

// 5. 控制面板：积分与盲盒管理处理器
class PointsManageHandler extends Handler {
  async prepare() {
    this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
  }

  async get() {
    const { boxPrice, colorNamePrice, boxPrizes } = await getShopConfig();
    const totalWeight = boxPrizes.reduce((sum, p) => sum + (p.weight || 0), 0) || 1;
    const prizesWithRatio = boxPrizes.map(p => ({
      ...p,
      ratio: ((p.weight / totalWeight) * 100).toFixed(1),
    }));

    // 获取最近 20 条积分记录
    const recentLogs = await db.collection('point_log')
      .find()
      .sort({ _id: -1 })
      .limit(20)
      .toArray();

    this.response.template = 'points_manage.html';
    this.response.body = {
      boxPrice,
      colorNamePrice,
      boxPrizes: prizesWithRatio,
      boxPrizesJson: JSON.stringify(boxPrizes, null, 2),
      recentLogs,
      moment,
    };
  }

  @param('operation', Types.String)
  async post(domainId: string, operation: string) {
    if (operation === 'grantPoints') {
      const userKey = (this.request.body.userKey || '').toString().trim();
      const amount = parseInt(this.request.body.amount, 10);
      const reason = (this.request.body.reason || '').toString().trim() || '管理员手动发放/调整';

      if (!userKey || isNaN(amount) || amount === 0) {
        throw new ValidationError('amount', '请输入有效的目标用户与积分数值');
      }

      // 支持通过 UID 或 用户名(uname) 检索目标用户
      let targetUser = null;
      if (/^\d+$/.test(userKey)) {
        targetUser = await UserModel.getById(domainId, parseInt(userKey, 10));
      }
      if (!targetUser) {
        targetUser = await UserModel.getByUname(domainId, userKey);
      }
      if (!targetUser) {
        throw new UserNotFoundError(userKey);
      }

      const targetUid = targetUser._id;

      // 调整用户积分
      await db.collection('user').updateOne(
        { _id: targetUid },
        { $inc: { points: amount } }
      );

      // 记录管理流水
      await db.collection('point_log').insertOne({
        uid: targetUid,
        domainId,
        type: 'admin_adjust',
        amount,
        reason,
        operatorUid: this.user._id,
        createdAt: new Date(),
      });

      // 发送站内信通知用户
      try {
        const actionDesc = amount > 0 ? `获得系统发放的 ${amount} 积分奖励` : `被系统扣除 ${Math.abs(amount)} 积分`;
        await MessageModel.send(
          1,
          targetUid,
          `📢 积分变动通知：\n你的账户已${actionDesc}！\n原因/备注：${reason}`
        );
      } catch (e) {
        console.warn('[Points Plugin] 发送积分通知失败:', e);
      }
    } else if (operation === 'updateConfig') {
      const boxPrice = Math.max(1, parseInt(this.request.body.boxPrice, 10) || DEFAULT_BOX_PRICE);
      const colorNamePrice = Math.max(1, parseInt(this.request.body.colorNamePrice, 10) || DEFAULT_COLOR_NAME_PRICE);

      let boxPrizes = [];
      try {
        boxPrizes = JSON.parse(this.request.body.boxPrizesJson);
      } catch (e) {
        throw new ValidationError('boxPrizesJson', '奖项配置 JSON 语法不合法');
      }

      if (!Array.isArray(boxPrizes) || boxPrizes.length === 0) {
        throw new ValidationError('boxPrizesJson', '奖项列表数组不能为空');
      }

      await SystemModel.set('points.box_price', boxPrice);
      await SystemModel.set('points.color_name_price', colorNamePrice);
      await SystemModel.set('points.box_prizes', boxPrizes);
    }

    this.back();
  }
}

export function apply(ctx: Context) {
  // 1. 注册商城与 API 路由
  ctx.Route('shop_page', '/shop', ShopHandler);
  ctx.Route('shop_buy_box', '/api/shop/buy_box', BuyBoxHandler);
  ctx.Route('shop_buy_color_name', '/api/shop/buy_color_name', BuyColorNameHandler);
  ctx.Route('shop_user_effect', '/api/shop/user_effect', UserEffectHandler);

  // 2. 注册控制面板管理路由与侧边栏入口
  ctx.Route('points_manage', '/manage/points', PointsManageHandler, PRIV.PRIV_EDIT_SYSTEM);
  ctx.injectUI('ControlPanel', 'points_manage', { icon: 'gift' });

  // 3. 国际化支持
  ctx.i18n.load('zh', {
    'points_manage': '积分与盲盒管理',
    'Points Management': '积分与盲盒管理',
  });
  ctx.i18n.load('en', {
    'points_manage': 'Points & Mystery Box',
    'Points Management': 'Points & Mystery Box',
  });

  // 4. 初始化索引
  ctx.on('ready', async () => {
    try {
      await db.collection('point_log').createIndex(
        { uid: 1, domainId: 1, pid: 1, type: 1 },
        { background: true }
      );
    } catch (e) {
      console.error('[Points Plugin] 创建索引失败:', e);
    }
  });

  // 5. AC 奖励逻辑（已修复题号非 P 开头显示异常）
  ctx.on('record/judge', async (rdoc) => {
    try {
      if (!rdoc || !rdoc.uid || rdoc.uid <= 1) return;
      if (rdoc.status !== STATUS.STATUS_ACCEPTED) return;

      const { uid, domainId, pid } = rdoc;
      const logColl = db.collection('point_log');

      const hasRewarded = await logColl.findOne({
        uid,
        domainId,
        pid,
        type: 'problem_ac',
      });

      if (hasRewarded) return;

      // 🌟 获取题目真实展示题号（兼容数字/字母/自定义题号）
      const pdoc = await ProblemModel.get(domainId, pid);
      const problemDocId = pdoc?.docId || pid;

      const rewardPoints = Math.floor(Math.random() * 91) + 10;

      await db.collection('user').updateOne(
        { _id: uid },
        { $inc: { points: rewardPoints } }
      );

      await logColl.insertOne({
        uid,
        domainId,
        pid,
        rid: rdoc._id,
        amount: rewardPoints,
        type: 'problem_ac',
        reason: `首次通过题目 ${problemDocId} 奖励`,
        createdAt: new Date(),
      });

      try {
        await MessageModel.send(
          1,
          uid,
          `🎉 恭喜你通过题目 ${problemDocId} ！\n已为你随机发放 ${rewardPoints} 积分奖励！`
        );
      } catch (msgErr) {
        console.warn('[Points Plugin] 发送积分通知失败:', msgErr);
      }
    } catch (err) {
      console.error('[Points Plugin] 处理积分奖励异常:', err);
    }
  });
}