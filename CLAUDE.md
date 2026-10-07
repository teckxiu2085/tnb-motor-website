# TnB MOTOR 网站 · 给 Claude 的固定规则

这个仓库是 TnB MOTOR SDN BHD（马来西亚柔佛 Pasir Gudang 的二手车行）的官网。
完整的设计要求在 `BRIEF.md`，开工前先读完。

## 跟老板沟通

- 老板（修哥）不是程序员。用**简体中文**、白话跟他讲，少用术语；要他做的事写成一步一步的点击说明。
- 遇到要他决定的事，给一个推荐选项，不要列一大堆。
- 每完成一个阶段，告诉他怎么在手机上看效果。

## 绝对不能做

- **不编造任何事实**：电话、WhatsApp、地址、营业时间、价格、里程、车况、保修、"无水灾/无事故"、客户评价、奖项、开业年份、卖出多少辆车……都只能用 `content/` 里已有的，或老板亲口给的。没有的就留 `TODO`，网站上先把那一块藏起来，并在汇报里列出来。
- **这个仓库是公开的**。不能放成本、修车费、利润、车主资料、内部备注、任何密钥。库存只用 `content/inventory.json` 里的公开栏位。
- 不重画、不改色 logo（`public/brand/logo.png`，白底设计）。深色背景上要放在白色圆角底板上。
- 车辆照片只做缩放、裁切、压缩，不修图、不加滤镜、不 AI 生成假车图。照片里车牌清楚可读的，列出来让老板决定。
- 不加追踪、广告、cookie 弹窗；老板没要求就不装分析工具。

## 资料

- `content/inventory.json`：37 辆车的库存快照（2026-10-06）。`cashPriceRM` / `loanPriceRM` 为 `null` 时显示 "Ask for price"。年份像 `18/22` 表示 2018 年出厂、2022 年注册（recond 进口车）。
- `content/company.json`：公司资料，`TODO` 的部分等老板给。其中：
  - `whyTnb`：老板 2026-10-07 确认的事实（出车前 service、出车有 warranty、没有大撞、没有淹水）。warranty 年限 / 范围老板没给，不能写。
  - `loanEstimator`：老板确认的月供规则（flat rate）。Bank 3.5%、Credit 7%；最长年数 = min(9, 上限 − 车龄)，上限 Bank 15、Credit 20；车龄 = 今年 − 出厂年；首付默认 10%。
- `src/assets/cars/`：23 张车辆照片（竖图 3:4，一部分 1920×2560、一部分 810×1080）。网站打包时自动转成 AVIF/WebP、按屏幕出不同尺寸。`inventory.json` 里的 `/cars/xxx.jpeg` 只按文件名对应到这里。另外 14 辆还没有照片。
- `public/brand/logo.png`：官方 logo。

## 技术约定

- 纯静态网站，部署到 GitHub Pages（GitHub Actions 自动部署）。不需要服务器、数据库。
- 依赖越少越好；每次改完都要能 `npm run build` 成功。
- 手机优先：大部分客人是从 TikTok、WhatsApp 点进来的。
- 改完跑 `npm run build` 再跑 `npm run check`（检查坏链接、页面里漏出 "TODO"、每辆车都有 WhatsApp 按钮）。GitHub Actions 也会跑这两步。
- 读库存只经过 `src/data/source.ts` → `src/data/vehicles.ts`；`vehicles.ts` 有公开栏位白名单，其他栏位一律丢掉。
- 车卡照片在打包时按焦点（`50% 62%`）裁成 4:3（`src/lib/image-service.ts`），只是裁切和缩放。
- 以后接实时库存（第 6 阶段）：定价规则和成本只放在老板自己 Google 账号里的 Apps Script，**不能放进这个仓库**；仓库只存公开快照（`content/inventory.json` + 照片）。
