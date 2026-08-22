import { Context, STATUS, db, MessageModel, Handler, PermissionError, ProblemModel, PRIV } from 'hydrooj';

const BOX_PRICE = 199;
const COLOR_NAME_PRICE = 299; // 彩色用户名价格 (299积分/天)

const BOX_PRIZES = [
  { points: 1999, weight: 10 },
  { points: 888,  weight: 40 },
  { points: 399,  weight: 158 },
  { points: 199,  weight: 192 },
  { points: 99,   weight: 380 },
  { points: 66,   weight: 70 },
  { points: 0,    weight: 150 },
];

function rollMysteryBox(): number {
  const rand = Math.floor(Math.random() * 1000);
  let accumulated = 0;
  for (const prize of BOX_PRIZES) {
    accumulated += prize.weight;
    if (rand < accumulated) return prize.points;
  }
  return 0;
}

// 1. 商城页面
class ShopHandler extends Handler {
  async get() {
    if (!this.user._id || this.user._id <= 1) {
      this.response.redirect = '/login';
      return;
    }
    const udoc = await db.collection('user').findOne({ _id: this.user._id });
    this.response.template = 'shop.html';
    this.response.body = {
      userPoints: udoc?.points || 0,
      colorNameExpire: udoc?.colorNameExpire || null,
    };
  }
}

// 2. 盲盒购买 API
class BuyBoxHandler extends Handler {
  async post() {
    const uid = this.user._id;
    if (!uid || uid <= 1) throw new PermissionError('请先登录');

    const deductRes = await db.collection('user').updateOne(
      { _id: uid, points: { $gte: BOX_PRICE } },
      { $inc: { points: -BOX_PRICE } }
    );

    if (deductRes.matchedCount === 0) {
      this.response.body = { error: '积分不足 199，无法开启盲盒' };
      return;
    }

    const reward = rollMysteryBox();
    if (reward > 0) {
      await db.collection('user').updateOne(
        { _id: uid },
        { $inc: { points: reward } }
      );
    }

    await db.collection('point_log').insertOne({
      uid,
      type: 'shop_mystery_box',
      cost: BOX_PRICE,
      reward,
      net: reward - BOX_PRICE,
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

    const deductRes = await db.collection('user').updateOne(
      { _id: uid, points: { $gte: COLOR_NAME_PRICE } },
      { $inc: { points: -COLOR_NAME_PRICE } }
    );

    if (deductRes.matchedCount === 0) {
      this.response.body = { error: `积分不足 ${COLOR_NAME_PRICE}，无法兑换` };
      return;
    }

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
      cost: COLOR_NAME_PRICE,
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

// 4. 用户特效查询 API
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

export function apply(ctx: Context) {
  // 注册页面与 API 路由
  ctx.Route('shop_page', '/shop', ShopHandler);
  ctx.Route('shop_buy_box', '/api/shop/buy_box', BuyBoxHandler);
  ctx.Route('shop_buy_color_name', '/api/shop/buy_color_name', BuyColorNameHandler);
  ctx.Route('shop_user_effect', '/api/shop/user_effect', UserEffectHandler);

  // ⭐ 使用官方标准 UI 注入点将积分商城添加到右上角用户下拉菜单
  ctx.injectUI(
    'UserDropdown',
    'shop_page',
    { icon: 'crown', displayName: '积分商城' },
    PRIV.PRIV_USER_PROFILE
  );

  // 索引初始化
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

  // AC 奖励监听
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

      const rewardPoints = Math.floor(Math.random() * 91) + 10;

      await db.collection('user').updateOne(
        { _id: uid },
        { $inc: { points: rewardPoints } }
      );

      const pdoc = await ProblemModel.get(domainId, pid);
      const problemId = pdoc?.docId || pid;
      const problemDisplay = pdoc?.title ? `${problemId} (${pdoc.title})` : `#${problemId}`;

      await logColl.insertOne({
        uid,
        domainId,
        pid,
        rid: rdoc._id,
        amount: rewardPoints,
        type: 'problem_ac',
        reason: `首次通过题目 #${problemId} 奖励`,
        createdAt: new Date(),
      });

      try {
        await MessageModel.send(
          1,
          uid,
          `🎉 恭喜你通过题目 ${problemDisplay} ！\n已为你随机发放 ${rewardPoints} 积分奖励！`
        );
      } catch (msgErr) {
        console.warn('[Points Plugin] 发送积分通知失败:', msgErr);
      }
    } catch (err) {
      console.error('[Points Plugin] 处理积分奖励异常:', err);
    }
  });
}