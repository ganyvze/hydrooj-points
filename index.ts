import { Context, STATUS, db, MessageModel } from 'hydrooj';

// 生成指定区间的随机整数 [min, max]
function getRandomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

export function apply(ctx: Context) {
  // 1. 初始化数据库索引（防止高并发下重复加分）
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

  // 2. 监听评测完成事件
  ctx.on('record/judge', async (rdoc) => {
    try {
      // (1) 基础校验：必须为登录用户（uid > 1），未登录用户 uid 为 0
      if (!rdoc || !rdoc.uid || rdoc.uid <= 1) {
        return;
      }

      // (2) 校验评测状态是否为 AC (Accepted)
      if (rdoc.status !== STATUS.STATUS_ACCEPTED) {
        return;
      }

      // (3) 可选：如果是比赛中的提交，不发放常规积分（视需求决定是否开启）
      // if (rdoc.contest) return;

      const { uid, domainId, pid } = rdoc;

      // (4) 防刷校验：检查用户是否已经获得过该题目的 AC 积分
      const logColl = db.collection('point_log');
      const hasRewarded = await logColl.findOne({
        uid,
        domainId,
        pid,
        type: 'problem_ac',
      });

      if (hasRewarded) {
        // 该用户此前已因 AC 该题获得过积分，跳过
        return;
      }

      // (5) 生成 10 - 100 的随机积分
      const rewardPoints = getRandomInt(10, 100);

      // (6) 原子更新：更新用户表中的 points 字段（若不存在则自动初始化）
      await db.collection('user').updateOne(
        { _id: uid },
        { $inc: { points: rewardPoints } }
      );

      // (7) 记录积分变动流水
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

      // (8) 发送站内信通知用户（可选增强体验）
      try {
        await MessageModel.send(
          1, // 系统账号发信
          uid,
          `🎉 恭喜你通过题目 P${pid} ！\n本次提交已为你随机发放 ${rewardPoints} 积分奖励！`
        );
      } catch (msgErr) {
        // 站内信失败不影响主流程
        console.warn('[Points Plugin] 发送积分通知消息失败:', msgErr);
      }

    } catch (err) {
      console.error('[Points Plugin] 处理积分奖励时发生异常:', err);
    }
  });
}