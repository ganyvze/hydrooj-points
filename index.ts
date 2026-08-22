import { Context, STATUS, db, MessageModel, Handler, UserError, PermissionError } from 'hydrooj';

// 盲盒奖项与严格不赚不亏概率配置表 (总权重 1000)
const BOX_PRIZES = [
  { points: 1999, weight: 10 },  // 1.0%
  { points: 888,  weight: 40 },  // 4.0%
  { points: 399,  weight: 158 }, // 15.8%
  { points: 199,  weight: 192 }, // 19.2%
  { points: 99,   weight: 380 }, // 38.0%
  { points: 66,   weight: 70 },  // 7.0%
  { points: 0,    weight: 150 }, // 15.0%
];

// 根据权重抽取盲盒结果
function rollMysteryBox(): number {
  const rand = Math.floor(Math.random() * 1000); // [0, 999]
  let accumulated = 0;
  for (const prize of BOX_PRIZES) {
    accumulated += prize.weight;
    if (rand < accumulated) {
      return prize.points;
    }
  }
  return 0;
}

// 1. 商城页面 Handler (GET /shop)
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
    };
  }
}

// 2. 盲盒购买 API Handler (POST /api/shop/buy_box)
class BuyBoxHandler extends Handler {
  async post() {
    const uid = this.user._id;
    if (!uid || uid <= 1) {
      throw new PermissionError('请先登录');
    }

    const BOX_PRICE = 199;

    // (1) 原子扣除 199 积分，确保并发防透支
    const deductRes = await db.collection('user').updateOne(
      { _id: uid, points: { $gte: BOX_PRICE } },
      { $inc: { points: -BOX_PRICE } }
    );

    if (deductRes.matchedCount === 0) {
      this.response.body = { error: '积分不足，无法开启盲盒' };
      return;
    }

    // (2) 抽取奖励
    const reward = rollMysteryBox();

    // (3) 如果中奖积分 > 0，增加积分
    if (reward > 0) {
      await db.collection('user').updateOne(
        { _id: uid },
        { $inc: { points: reward } }
      );
    }

    // (4) 记录商城抽奖流水
    await db.collection('point_log').insertOne({
      uid,
      type: 'shop_mystery_box',
      cost: BOX_PRICE,
      reward,
      net: reward - BOX_PRICE,
      createdAt: new Date(),
    });

    // (5) 获取用户最新积分并返回
    const updatedUser = await db.collection('user').findOne({ _id: uid });

    this.response.body = {
      reward,
      userPoints: updatedUser?.points || 0,
    };
  }
}

export function apply(ctx: Context) {
  // 注册商城页面与开箱接口路由
  ctx.Route('shop_page', '/shop', ShopHandler);
  ctx.Route('shop_buy_box', '/api/shop/buy_box', BuyBoxHandler);

  // 数据库索引
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

  // AC 题目奖励监听
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

      // 10 ~ 100 随机积分
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
        reason: `首次通过题目 P${pid} 奖励`,
        createdAt: new Date(),
      });

      console.log(`[Points Plugin] 用户 ${uid} 首次 AC 题目 P${pid}，获得 ${rewardPoints} 积分`);

      try {
        await MessageModel.send(
          1,
          uid,
          `🎉 恭喜你通过题目 P${pid} ！\n本次提交已为你随机发放 ${rewardPoints} 积分奖励！`
        );
      } catch (msgErr) {
        console.warn('[Points Plugin] 发送积分通知失败:', msgErr);
      }
    } catch (err) {
      console.error('[Points Plugin] 处理积分奖励时发生异常:', err);
    }
  });
}