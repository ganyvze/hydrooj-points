import { Context, STATUS, db, MessageModel, Handler, PermissionError, ProblemModel, PRIV } from 'hydrooj';

const BOX_PRICE = 199;
const COLOR_NAME_PRICE = 299;    // 彩色用户名价格 (299积分/天)
const DOUBLE_CARD_PRICE = 399;   // 积分翻倍卡价格 (399积分/24小时)
const SOLITUDE_CARD_PRICE = 199;  // 自闭卡价格 (199积分/24小时)

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
      doublePointsExpire: udoc?.doublePointsExpire || null,
      solitudeExpire: udoc?.solitudeExpire || null,
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

    let reward = rollMysteryBox();
    const udoc = await db.collection('user').findOne({ _id: uid });
    const now = Date.now();
    const isDouble = !!(udoc?.doublePointsExpire && new Date(udoc.doublePointsExpire).getTime() > now);

    // 翻倍卡对盲盒奖励同样生效
    if (isDouble && reward > 0) {
      reward *= 2;
    }

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
      isDouble,
      net: reward - BOX_PRICE,
      createdAt: new Date(),
    });

    const updatedUser = await db.collection('user').findOne({ _id: uid });
    this.response.body = {
      reward,
      isDouble,
      userPoints: updatedUser?.points || 0,
    };
  }
}

// 3. 购买彩色用户名 API（增加与自闭卡的互斥检测）
class BuyColorNameHandler extends Handler {
  async post() {
    const uid = this.user._id;
    if (!uid || uid <= 1) throw new PermissionError('请先登录');

    const now = Date.now();
    const udoc = await db.collection('user').findOne({ _id: uid });

    // 互斥校验：自闭卡生效中无法购买彩色用户名
    if (udoc?.solitudeExpire && new Date(udoc.solitudeExpire).getTime() > now) {
      this.response.body = { error: '自闭卡生效期间无法购买彩色用户名，请等待自闭卡过期！' };
      return;
    }

    const deductRes = await db.collection('user').updateOne(
      { _id: uid, points: { $gte: COLOR_NAME_PRICE } },
      { $inc: { points: -COLOR_NAME_PRICE } }
    );

    if (deductRes.matchedCount === 0) {
      this.response.body = { error: `积分不足 ${COLOR_NAME_PRICE}，无法兑换` };
      return;
    }

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

// 4. 购买积分翻倍卡 API
class BuyDoubleCardHandler extends Handler {
  async post() {
    const uid = this.user._id;
    if (!uid || uid <= 1) throw new PermissionError('请先登录');

    const deductRes = await db.collection('user').updateOne(
      { _id: uid, points: { $gte: DOUBLE_CARD_PRICE } },
      { $inc: { points: -DOUBLE_CARD_PRICE } }
    );

    if (deductRes.matchedCount === 0) {
      this.response.body = { error: `积分不足 ${DOUBLE_CARD_PRICE}，无法兑换` };
      return;
    }

    const now = Date.now();
    const udoc = await db.collection('user').findOne({ _id: uid });
    let baseTime = now;
    if (udoc?.doublePointsExpire && new Date(udoc.doublePointsExpire).getTime() > now) {
      baseTime = new Date(udoc.doublePointsExpire).getTime();
    }
    const expireAt = new Date(baseTime + 24 * 60 * 60 * 1000);

    await db.collection('user').updateOne(
      { _id: uid },
      { $set: { doublePointsExpire: expireAt } }
    );

    await db.collection('point_log').insertOne({
      uid,
      type: 'shop_buy_double_card',
      cost: DOUBLE_CARD_PRICE,
      durationDays: 1,
      expireAt,
      createdAt: new Date(),
    });

    const updatedUser = await db.collection('user').findOne({ _id: uid });
    this.response.body = {
      success: true,
      userPoints: updatedUser?.points || 0,
      doublePointsExpire: expireAt,
    };
  }
}

// 5. 购买自闭卡 API（增加与彩色用户名的互斥检测）
class BuySolitudeCardHandler extends Handler {
  async post() {
    const uid = this.user._id;
    if (!uid || uid <= 1) throw new PermissionError('请先登录');

    const now = Date.now();
    const udoc = await db.collection('user').findOne({ _id: uid });

    // 互斥校验：彩色用户名生效中无法购买自闭卡
    if (udoc?.colorNameExpire && new Date(udoc.colorNameExpire).getTime() > now) {
      this.response.body = { error: '彩色用户名生效期间无法开启自闭卡，请等待彩色名过期！' };
      return;
    }

    const deductRes = await db.collection('user').updateOne(
      { _id: uid, points: { $gte: SOLITUDE_CARD_PRICE } },
      { $inc: { points: -SOLITUDE_CARD_PRICE } }
    );

    if (deductRes.matchedCount === 0) {
      this.response.body = { error: `积分不足 ${SOLITUDE_CARD_PRICE}，无法兑换` };
      return;
    }

    let baseTime = now;
    if (udoc?.solitudeExpire && new Date(udoc.solitudeExpire).getTime() > now) {
      baseTime = new Date(udoc.solitudeExpire).getTime();
    }
    const expireAt = new Date(baseTime + 24 * 60 * 60 * 1000);

    await db.collection('user').updateOne(
      { _id: uid },
      { $set: { solitudeExpire: expireAt } }
    );

    await db.collection('point_log').insertOne({
      uid,
      type: 'shop_buy_solitude_card',
      cost: SOLITUDE_CARD_PRICE,
      durationDays: 1,
      expireAt,
      createdAt: new Date(),
    });

    const updatedUser = await db.collection('user').findOne({ _id: uid });
    this.response.body = {
      success: true,
      userPoints: updatedUser?.points || 0,
      solitudeExpire: expireAt,
    };
  }
}

// 6. 用户状态及特效查询 API
class UserEffectHandler extends Handler {
  async get() {
    const targetUid = parseInt(this.request.query.uid as string, 10);
    if (!targetUid || targetUid <= 1) {
      this.response.body = { isColorName: false, isSolitude: false, isDoublePoints: false };
      return;
    }

    const udoc = await db.collection('user').findOne({ _id: targetUid });
    const now = Date.now();
    const isColorName = !!(udoc?.colorNameExpire && new Date(udoc.colorNameExpire).getTime() > now);
    const isSolitude = !!(udoc?.solitudeExpire && new Date(udoc.solitudeExpire).getTime() > now);
    const isDoublePoints = !!(udoc?.doublePointsExpire && new Date(udoc.doublePointsExpire).getTime() > now);

    this.response.body = {
      isColorName,
      isSolitude,
      isDoublePoints,
      expireAt: udoc?.colorNameExpire || null,
      solitudeExpire: udoc?.solitudeExpire || null,
      doublePointsExpire: udoc?.doublePointsExpire || null,
    };
  }
}

export function apply(ctx: Context) {
  // 注册路由
  ctx.Route('shop_page', '/shop', ShopHandler);
  ctx.Route('shop_buy_box', '/api/shop/buy_box', BuyBoxHandler);
  ctx.Route('shop_buy_color_name', '/api/shop/buy_color_name', BuyColorNameHandler);
  ctx.Route('shop_buy_double_card', '/api/shop/buy_double_card', BuyDoubleCardHandler);
  ctx.Route('shop_buy_solitude', '/api/shop/buy_solitude', BuySolitudeCardHandler);
  ctx.Route('shop_user_effect', '/api/shop/user_effect', UserEffectHandler);

  // 注入导航栏下拉菜单
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

  // 拦截个人主页访问：自闭卡生效期间他人无法访问
  ctx.on('handler/after/UserDetail', async (h) => {
    const targetUser = h.response.body?.udoc;
    if (!targetUser) return;
    const now = Date.now();
    const isSolitude = targetUser.solitudeExpire && new Date(targetUser.solitudeExpire).getTime() > now;
    if (isSolitude) {
      // 访问者非本人时拦截
      if (!h.user?._id || h.user._id !== targetUser._id) {
        throw new PermissionError('该用户正在自闭中，个人主页暂不可访问');
      }
    }
  });

  // AC 奖励监听（包含翻倍卡判定）
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

      const udoc = await db.collection('user').findOne({ _id: uid });
      const now = Date.now();
      const isDouble = !!(udoc?.doublePointsExpire && new Date(udoc.doublePointsExpire).getTime() > now);

      let rewardPoints = Math.floor(Math.random() * 91) + 10;
      if (isDouble) {
        rewardPoints *= 2;
      }

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
        isDouble,
        type: 'problem_ac',
        reason: `首次通过题目 #${problemId} 奖励${isDouble ? ' (翻倍卡生效)' : ''}`,
        createdAt: new Date(),
      });

      try {
        const doubleTip = isDouble ? '\n【积分翻倍卡生效中】奖励已翻倍⚡' : '';
        await MessageModel.send(
          1,
          uid,
          `🎉 恭喜你通过题目 ${problemDisplay} ！${doubleTip}\n已为你发放 ${rewardPoints} 积分奖励！`
        );
      } catch (msgErr) {
        console.warn('[Points Plugin] 发送积分通知失败:', msgErr);
      }
    } catch (err) {
      console.error('[Points Plugin] 处理积分奖励异常:', err);
    }
  });
}