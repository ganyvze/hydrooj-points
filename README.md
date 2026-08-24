# HydroOJ Points Plugin

一个功能丰富的 HydroOJ 积分系统插件，为在线评测平台提供积分商城、用户特权管理和自动奖励功能。

## 🌟 功能特性

### 🛍️ 积分商城系统
- **幸运积分盲盒** - 199积分开一次，最高可获得1999积分
- **彩色用户名** - 299积分/天，炫彩流光效果
- **积分翻倍卡** - 399积分/天，24小时内所有积分获取翻倍
- **自闭卡** - 199积分/天，24小时内禁止他人访问个人主页
- **彩蛋** - 99积分/天
- **改名卡** - 599积分/次，可修改为未被占用的新用户名

### 🎯 自动积分奖励
- **题目AC奖励** - 首次通过题目获得10-100随机积分
- **翻倍卡支持** - 翻倍卡生效期间奖励翻倍

### 🛡️ 管理后台
- **积分管理面板** - 超级管理员可查看所有用户积分
- **积分操作** - 支持发放、扣除、重置用户积分
- **特权管理** - 管理员可手动设置各种特权时效
- **流水记录** - 完整的积分变动日志查询

### ✨ 视觉特效
- **流光动画** - 彩色用户名CSS渐变动画
- **徽标系统** - 各种特权状态的视觉标识
- **响应式设计** - 支持亮色/暗色主题切换
- **弹窗交互** - 优雅的操作反馈弹窗

## 📦 安装

### 安装步骤

```bash
cd /root/.hydro/addons
git clone https://github.com/ganyvze/hydrooj-points
hydrooj addon add /root/.hydro/addons/hydrooj-points
pm2 restart hydrooj
```

一键安装：

```bash
cd /root/.hydro/addons && git clone https://github.com/ganyvze/hydrooj-points && hydrooj addon add /root/.hydro/addons/hydrooj-points && pm2 restart hydrooj
```

## 🎮 使用说明

### 用户端功能

#### 积分商城访问
用户可通过顶部导航栏的"积分商城"进入商城页面，查看当前积分余额并购买各种道具。

#### 积分获取方式
1. **刷题奖励** - 首次通过题目获得10-100随机积分
2. **盲盒抽奖** - 花费199积分开启盲盒，获得随机积分奖励
3. **管理员发放** - 管理员可手动发放积分

#### 道具使用说明

**幸运积分盲盒**
- 消耗：199积分/次
- 奖励：0-1999积分（概率公开）
- 特殊：翻倍卡生效时奖励翻倍

**彩色用户名**
- 消耗：299积分/天
- 效果：用户名显示炫彩流光效果
- 限制：与自闭卡互斥

**积分翻倍卡**
- 消耗：399积分/天
- 效果：24小时内所有积分获取翻倍
- 适用：盲盒奖励、题目AC奖励

**自闭卡**
- 消耗：199积分/天
- 效果：他人无法访问个人主页
- 限制：与彩色用户名互斥

**彩蛋**
- 消耗：99积分/天

**改名卡**
- 消耗：599积分/次
- 效果：将用户名修改为新名称

### 管理员功能

#### 积分管理面板
访问 `/manage/points` 进入积分管理后台（需要超级管理员权限）。

#### 主要功能
1. **用户积分查看** - 查看所有用户的积分排名和详情
2. **积分流水查询** - 查看所有积分变动记录
3. **积分操作** - 发放、扣除、重置用户积分
4. **特权管理** - 手动设置各种特权时效

#### 积分操作说明

**发放积分**
```
POST /manage/points/:uid?operation=grant
参数：
- amount: 发放数量（必填）
- reason: 发放理由（可选）
```

**扣除积分**
```
POST /manage/points/:uid?operation=deduct
参数：
- amount: 扣除数量（必填）
- reason: 扣除理由（可选）
```

**重置积分**
```
POST /manage/points/:uid?operation=setPoints
参数：
- targetPoints: 目标积分值（必填）
- reason: 调整理由（可选）
```

**特权管理**
```
POST /manage/points/:uid?operation=setPerk
参数：
- perkType: 特权类型（colorName/doublePoints/solitude/easterEgg）
- action: 操作类型（grant/clear）
- days: 天数（grant时必填）
```

## 📊 数据库结构

### 用户扩展字段
```typescript
interface User {
  points?: number;           // 用户积分
  colorNameExpire?: Date;     // 彩色用户名过期时间
  doublePointsExpire?: Date;  // 积分翻倍卡过期时间
  solitudeExpire?: Date;     // 自闭卡过期时间
  easterEggExpire?: Date;    // 彩蛋过期时间
}
```

### 积分流水集合
```typescript
interface PointLogDoc {
  uid: number;               // 用户ID
  domainId?: string;          // 域名ID
  pid?: number;              // 题目ID
  rid?: any;                 // 提交记录ID
  type: string;              // 操作类型
  amount?: number;            // 变动数量
  cost?: number;             // 消耗数量
  reward?: number;           // 奖励数量
  net?: number;              // 净变动
  isDouble?: boolean;        // 是否翻倍
  durationDays?: number;     // 持续天数
  expireAt?: Date;           // 过期时间
  reason?: string;           // 操作原因
  operatorUid?: number;      // 操作员ID
  createdAt: Date;          // 创建时间
}
```

## 🔧 配置选项

### 价格配置
在 `index.ts` 中可以修改各道具价格：
```typescript
const BOX_PRICE = 199;           // 盲盒价格
const COLOR_NAME_PRICE = 299;    // 彩色用户名价格
const DOUBLE_CARD_PRICE = 399;   // 积分翻倍卡价格
const SOLITUDE_CARD_PRICE = 199; // 自闭卡价格
const EASTER_EGG_PRICE = 99;    // 彩蛋价格
const RENAME_CARD_PRICE = 599;  // 改名卡价格
```

### 奖励概率配置
盲盒奖励概率可在 `BOX_PRIZES` 数组中配置：
```typescript
const BOX_PRIZES = [
  { points: 1999, weight: 10 },  // 1.0%
  { points: 888,  weight: 40 },   // 4.0%
  { points: 399,  weight: 158 },  // 15.8%
  { points: 199,  weight: 192 },  // 19.2%
  { points: 99,   weight: 380 },  // 38.0%
  { points: 66,   weight: 70 },   // 7.0%
  { points: 0,    weight: 150 },  // 15.0%
];
```

### 题目奖励配置
AC题目的基础奖励范围可在代码中调整：
```typescript
let rewardPoints = Math.floor(Math.random() * 91) + 10;  // 10-100积分
```

## 🎨 界面定制

### CSS变量主题
模板文件支持通过CSS变量自定义主题：
```css
:root {
  --shop-bg-card: #ffffff;
  --shop-bg-sub: #f8fafc;
  --shop-border: #e2e8f0;
  --shop-text-main: #0f172a;
  --shop-text-sub: #64748b;
  /* 更多变量... */
}
```

### JavaScript特效
前端特效可通过 `frontend/user_detail.page.ts` 自定义：
- 彩色用户名流光效果
- 自闭卡状态显示
- 彩蛋文字替换
- 动画效果