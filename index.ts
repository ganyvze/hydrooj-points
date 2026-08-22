import {
  Context,
  Handler,
  param,
  PRIV,
  Types,
  UserModel,
  DomainModel,
  ValidationError,
  UserNotFoundError,
  PermissionError,
  MessageModel,
  ProblemModel,
  STATUS,
  db,
  moment,
} from 'hydrooj';

declare module 'hydrooj' {
  interface User {
    points?: number;
    colorNameExpire?: Date;
    doublePointsExpire?: Date;
    solitudeExpire?: Date;
  }
  interface Collections {
    point_log: PointLogDoc;
  }
}

export interface PointLogDoc {
  _id?: any;
  uid: number;
  domainId?: string;
  pid?: number;
  rid?: any;
  type: string;
  amount?: number;
  cost?: number;
  reward?: number;
  net?: number;
  isDouble?: boolean;
  durationDays?: number;
  expireAt?: Date;
  reason?: string;
  operatorUid?: number;
  createdAt: Date;
}

const BOX_PRICE = 199;
const COLOR_NAME_PRICE = 299;    // 彩色用户名价格 (299积分/天)
const DOUBLE_CARD_PRICE = 399;   // 积分翻倍卡价格 (399积分/24小时)
const SOLITUDE_CARD_PRICE = 199; // 自闭卡价格 (199积分/24小时)

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

/* ==========================================================================
   前台：用户商城相关 Handler
   ========================================================================== */

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

class BuyColorNameHandler extends Handler {
  async post() {
    const uid = this.user._id;
    if (!uid || uid <= 1) throw new PermissionError('请先登录');

    const now = Date.now();
    const udoc = await db.collection('user').findOne({ _id: uid });

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

class BuySolitudeCardHandler extends Handler {
  async post() {
    const uid = this.user._id;
    if (!uid || uid <= 1) throw new PermissionError('请先登录');

    const now = Date.now();
    const udoc = await db.collection('user').findOne({ _id: uid });

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

/* ==========================================================================
   后台：控制面板（超级管理员）积分管理 Handler
   ========================================================================== */

class PointsManageHandler extends Handler {
  async prepare() {
    this.checkPriv(PRIV.PRIV_EDIT_SYSTEM);
  }
}

class PointsManageMainHandler extends PointsManageHandler {
  @param('page', Types.PositiveInt, true)
  @param('search', Types.String, true)
  @param('sort', Types.String, true)
  @param('tab', Types.String, true)
  async get(domainId: string, page = 1, search = '', sort = 'points_desc', tab = 'users') {
    const limit = 20;

    const totalPointsAgg = await db.collection('user').aggregate([
      { $group: { _id: null, total: { $sum: { $ifNull: ['$points', 0] } } } }
    ]).toArray();
    const totalPoints = totalPointsAgg[0]?.total || 0;
    const totalUsersWithPoints = await db.collection('user').countDocuments({ points: { $gt: 0 } });

    const now = new Date();
    const activePerksCount = await db.collection('user').countDocuments({
      $or: [
        { colorNameExpire: { $gt: now } },
        { doublePointsExpire: { $gt: now } },
        { solitudeExpire: { $gt: now } },
      ],
    });
    const totalLogsCount = await db.collection('point_log').countDocuments();

    if (tab === 'logs') {
      const query: any = {};
      if (search) {
        if (!isNaN(+search)) {
          query.$or = [{ uid: +search }, { pid: +search }, { reason: new RegExp(search, 'i') }];
        } else {
          query.reason = new RegExp(search, 'i');
        }
      }

      const [logs, pageCount] = await this.paginate(
        db.collection('point_log').find(query).sort({ createdAt: -1 }),
        page,
        limit
      );

      const uids = Array.from(
        new Set(logs.map((l) => l.uid).concat(logs.map((l) => l.operatorUid).filter(Boolean)))
      );
      const userList = await db
        .collection('user')
        .find({ _id: { $in: uids } })
        .project({ _id: 1, uname: 1 })
        .toArray();
      const userMap = Object.fromEntries(userList.map((u) => [u._id, u.uname]));

      this.response.template = 'points_manage_main.html';
      this.response.body = {
        tab: 'logs',
        logs,
        userMap,
        page,
        pageCount,
        search,
        sort,
        stats: {
          totalPoints,
          totalUsersWithPoints,
          activePerksCount,
          totalLogsCount,
        },
        moment,
      };
      return;
    }

    const query: any = {};
    if (search) {
      const searchRegex = new RegExp(search, 'i');
      query.$or = [
        { uname: searchRegex },
        { mail: searchRegex },
        { _id: isNaN(+search) ? undefined : +search },
      ].filter(Boolean);
    }

    const sortOptions: Record<string, any> = {
      points_desc: { points: -1, _id: 1 },
      points_asc: { points: 1, _id: 1 },
      _id_asc: { _id: 1 },
      _id_desc: { _id: -1 },
      regat_desc: { regat: -1 },
      loginat_desc: { loginat: -1 },
    };
    const sortQuery = sortOptions[sort] || { points: -1, _id: 1 };

    const [udocs, pageCount] = await this.paginate(
      UserModel.getMulti(query).sort(sortQuery),
      page,
      limit
    );

    this.response.template = 'points_manage_main.html';
    this.response.body = {
      tab: 'users',
      udocs,
      page,
      pageCount,
      search,
      sort,
      stats: {
        totalPoints,
        totalUsersWithPoints,
        activePerksCount,
        totalLogsCount,
      },
      now: Date.now(),
      moment,
    };
  }
}

// 控制面板：用户积分详情、流水与修改操作（实现各 post[Operation] 分发方法）
class PointsManageDetailHandler extends PointsManageHandler {
  @param('uid', Types.Int)
  @param('page', Types.PositiveInt, true)
  async get(domainId: string, uid: number, page = 1) {
    const udoc = await UserModel.getById(domainId, uid);
    if (!udoc) throw new UserNotFoundError(uid);

    const limit = 20;
    const [logs, pageCount] = await this.paginate(
      db.collection('point_log').find({ uid }).sort({ createdAt: -1 }),
      page,
      limit
    );

    const operatorUids = Array.from(new Set(logs.map((l) => l.operatorUid).filter(Boolean)));
    const opUsers = await db
      .collection('user')
      .find({ _id: { $in: operatorUids } })
      .project({ _id: 1, uname: 1 })
      .toArray();
    const opUserMap = Object.fromEntries(opUsers.map((u) => [u._id, u.uname]));

    const now = Date.now();
    const isColorName = !!(udoc.colorNameExpire && new Date(udoc.colorNameExpire).getTime() > now);
    const isDoublePoints = !!(udoc.doublePointsExpire && new Date(udoc.doublePointsExpire).getTime() > now);
    const isSolitude = !!(udoc.solitudeExpire && new Date(udoc.solitudeExpire).getTime() > now);

    this.response.template = 'points_manage_detail.html';
    this.response.body = {
      udoc,
      points: udoc.points || 0,
      perks: {
        isColorName,
        colorNameExpire: udoc.colorNameExpire,
        isDoublePoints,
        doublePointsExpire: udoc.doublePointsExpire,
        isSolitude,
        solitudeExpire: udoc.solitudeExpire,
      },
      logs,
      opUserMap,
      page,
      pageCount,
      now,
      moment,
    };
  }

  // 1. 对应 operation=grant
  @param('uid', Types.Int)
  @param('amount', Types.Int)
  @param('reason', Types.String, true)
  async postGrant(domainId: string, uid: number, amount: number, reason = '管理员发放积分') {
    if (!amount || amount <= 0) throw new ValidationError('amount', '发放积分数值必须大于 0');
    const udoc = await UserModel.getById(domainId, uid);
    if (!udoc) throw new UserNotFoundError(uid);

    const operatorUid = this.user._id;
    reason = (reason || '管理员发放积分').trim();

    await db.collection('user').updateOne({ _id: uid }, { $inc: { points: amount } });

    await db.collection('point_log').insertOne({
      uid,
      type: 'admin_grant',
      amount,
      net: amount,
      reason,
      operatorUid,
      createdAt: new Date(),
    });

    try {
      await MessageModel.send(
        operatorUid || 1,
        uid,
        `🎁 管理员已为你发放 ${amount} 积分！\n理由：${reason}`
      );
    } catch (e) {}

    this.back();
  }

  // 2. 对应 operation=deduct
  @param('uid', Types.Int)
  @param('amount', Types.Int)
  @param('reason', Types.String, true)
  async postDeduct(domainId: string, uid: number, amount: number, reason = '管理员扣除积分') {
    if (!amount || amount <= 0) throw new ValidationError('amount', '扣除积分数值必须大于 0');
    const udoc = await UserModel.getById(domainId, uid);
    if (!udoc) throw new UserNotFoundError(uid);

    const operatorUid = this.user._id;
    reason = (reason || '管理员扣除积分').trim();

    const currentPoints = udoc.points || 0;
    const actualDeduct = Math.min(currentPoints, amount);

    await db.collection('user').updateOne({ _id: uid }, { $inc: { points: -actualDeduct } });

    await db.collection('point_log').insertOne({
      uid,
      type: 'admin_deduct',
      amount: -actualDeduct,
      net: -actualDeduct,
      reason,
      operatorUid,
      createdAt: new Date(),
    });

    try {
      await MessageModel.send(
        operatorUid || 1,
        uid,
        `⚠️ 管理员扣除了你的 ${actualDeduct} 积分。\n理由：${reason}`
      );
    } catch (e) {}

    this.back();
  }

  // 3. 对应 operation=setPoints
  @param('uid', Types.Int)
  @param('targetPoints', Types.Int)
  @param('reason', Types.String, true)
  async postSetPoints(domainId: string, uid: number, targetPoints: number, reason = '管理员手动调整积分') {
    if (isNaN(targetPoints) || targetPoints < 0) {
      throw new ValidationError('targetPoints', '目标积分不能为负数');
    }
    const udoc = await UserModel.getById(domainId, uid);
    if (!udoc) throw new UserNotFoundError(uid);

    const operatorUid = this.user._id;
    reason = (reason || '管理员手动调整积分').trim();

    const oldPoints = udoc.points || 0;
    const diff = targetPoints - oldPoints;

    await db.collection('user').updateOne({ _id: uid }, { $set: { points: targetPoints } });

    await db.collection('point_log').insertOne({
      uid,
      type: 'admin_set',
      amount: diff,
      net: diff,
      reason: `${reason} (由 ${oldPoints} 变更为 ${targetPoints})`,
      operatorUid,
      createdAt: new Date(),
    });

    this.back();
  }

  // 4. 对应 operation=setPerk
  @param('uid', Types.Int)
  @param('perkType', Types.String)
  @param('action', Types.String)
  @param('days', Types.Int, true)
  async postSetPerk(domainId: string, uid: number, perkType: string, action: string, days = 1) {
    const udoc = await UserModel.getById(domainId, uid);
    if (!udoc) throw new UserNotFoundError(uid);

    const operatorUid = this.user._id;
    const fieldMap: Record<string, string> = {
      colorName: 'colorNameExpire',
      doublePoints: 'doublePointsExpire',
      solitude: 'solitudeExpire',
    };
    const perkNames: Record<string, string> = {
      colorName: '彩色用户名',
      doublePoints: '积分翻倍卡',
      solitude: '自闭卡',
    };

    const field = fieldMap[perkType];
    if (!field) throw new ValidationError('perkType', '无效的特权类型');

    if (action === 'clear') {
      await db.collection('user').updateOne({ _id: uid }, { $unset: { [field]: 1 } });
      await db.collection('point_log').insertOne({
        uid,
        type: 'admin_perk_clear',
        reason: `管理员移除了特权：${perkNames[perkType]}`,
        operatorUid,
        createdAt: new Date(),
      });
    } else {
      if (isNaN(days) || days <= 0) throw new ValidationError('days', '天数必须大于 0');
      const now = Date.now();
      const currentExpire = udoc[field] ? new Date(udoc[field]).getTime() : 0;
      const base = currentExpire > now ? currentExpire : now;
      const newExpire = new Date(base + days * 24 * 60 * 60 * 1000);

      await db.collection('user').updateOne({ _id: uid }, { $set: { [field]: newExpire } });
      await db.collection('point_log').insertOne({
        uid,
        type: 'admin_perk_grant',
        reason: `管理员赠送/延长特权：${perkNames[perkType]} (${days} 天)`,
        expireAt: newExpire,
        operatorUid,
        createdAt: new Date(),
      });
    }

    this.back();
  }
}

/* ==========================================================================
   插件入口 apply
   ========================================================================== */

export function apply(ctx: Context) {
  // 1. 注册前台商城路由
  ctx.Route('shop_page', '/shop', ShopHandler);
  ctx.Route('shop_buy_box', '/api/shop/buy_box', BuyBoxHandler);
  ctx.Route('shop_buy_color_name', '/api/shop/buy_color_name', BuyColorNameHandler);
  ctx.Route('shop_buy_double_card', '/api/shop/buy_double_card', BuyDoubleCardHandler);
  ctx.Route('shop_buy_solitude', '/api/shop/buy_solitude', BuySolitudeCardHandler);
  ctx.Route('shop_user_effect', '/api/shop/user_effect', UserEffectHandler);

  // 2. 注册控制面板管理路由
  ctx.Route('points_manage_main', '/manage/points', PointsManageMainHandler, PRIV.PRIV_EDIT_SYSTEM);
  ctx.Route('points_manage_detail', '/manage/points/:uid', PointsManageDetailHandler, PRIV.PRIV_EDIT_SYSTEM);

  // 3. 注入顶部用户下拉菜单 & 控制面板侧边栏
  ctx.injectUI(
    'UserDropdown',
    'shop_page',
    { icon: 'crown', displayName: '积分商城' },
    PRIV.PRIV_USER_PROFILE
  );

  ctx.injectUI(
    'ControlPanel',
    'points_manage_main',
    { icon: 'crown', text: '积分管理' },
    PRIV.PRIV_EDIT_SYSTEM
  );

  // 4. 国际化
  ctx.i18n.load('zh', {
    points_manage_main: '积分管理',
    points_manage_detail: '积分管理详情',
    'Points Management': '积分管理',
    'User Points': '用户积分',
  });

  ctx.i18n.load('en', {
    points_manage_main: 'Points Management',
    points_manage_detail: 'Points Detail',
    'Points Management': 'Points Management',
    'User Points': 'User Points',
  });

  // 5. 索引初始化
  ctx.on('ready', async () => {
    try {
      await db.collection('point_log').createIndex(
        { uid: 1, domainId: 1, pid: 1, type: 1 },
        { background: true }
      );
      await db.collection('point_log').createIndex(
        { createdAt: -1 },
        { background: true }
      );
    } catch (e) {
      console.error('[Points Plugin] 创建索引失败:', e);
    }
  });

  // 6. 拦截自闭卡主页访问
  ctx.on('handler/after/UserDetail', async (h) => {
    const targetUser = h.response.body?.udoc;
    if (!targetUser) return;
    const now = Date.now();
    const isSolitude = targetUser.solitudeExpire && new Date(targetUser.solitudeExpire).getTime() > now;
    if (isSolitude) {
      if (!h.user?._id || (h.user._id !== targetUser._id && !h.user.hasPriv(PRIV.PRIV_EDIT_SYSTEM))) {
        throw new PermissionError('该用户正在自闭中，个人主页暂不可访问');
      }
    }
  });

  // 7. AC 奖励监听
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
        const doubleTip = isDouble ? '\n【积分翻倍卡生效中】奖励已翻倍 ⚡' : '';
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