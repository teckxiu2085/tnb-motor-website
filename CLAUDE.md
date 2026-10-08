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
- 不重画、不改色 logo（`public/brand/logo.png`，白底设计，文件本身是白底）。纯白底上直接放（`<LogoPlate plain />`）；其他底色上要放在白色圆角底板上。
- 车辆照片只做缩放、裁切、压缩，不修图、不加滤镜、不 AI 生成假车图。照片里车牌清楚可读的，列出来让老板决定。
- 不加追踪、广告、cookie 弹窗；老板没要求就不装分析工具。

## 资料

- `content/inventory.json`：网站用的公开库存快照。自动同步设定好以后，由 `scripts/sync-stock.mjs` 从老板的 Google 库存表更新（GitHub Actions 每小时一次），**不要手改**（下次同步会覆盖）；在那之前是 2026-10-06 的 37 辆车快照。`cashPriceRM` / `loanPriceRM` 为 `null` 时显示 "Ask for price"。年份像 `18/22` 表示 2018 年出厂、2022 年注册（recond 进口车）。
- `content/legacy.json`：第一份快照里的照片、精选车和变速箱（按车辆网址对应）。某辆车在 Google Drive 还没有照片时，同步程序先用这里的旧照片；型号里没写 AT / MT 的车，变速箱也从这里拿。
- `content/company.json`：公司资料，`TODO` 的部分等老板给。其中：
  - `whyTnb`：老板 2026-10-07 确认的事实（出车前 service、出车有 warranty、没有大撞、没有淹水）。warranty 年限 / 范围老板没给，不能写。
  - `loanEstimator`：老板确认的月供规则（flat rate）。Bank 3.5%、Credit 7%；最长年数 = min(9, 上限 − 车龄)，上限 Bank 15、Credit 20；车龄 = 今年 − 出厂年；首付默认 10%。
- `src/assets/cars/`：最早的 23 张车辆照片（竖图 3:4，一部分 1920×2560、一部分 810×1080）。`src/assets/cars/live/`：从 Google Drive 同步下来的照片（只转正、缩小到 1600px 以内、压缩，不带 EXIF/GPS），**不进仓库**（.gitignore），存在 GitHub Actions 缓存里。`inventory.json` 里的 `/cars/xxx` 对应到 `src/assets/cars/xxx`。网站打包时自动转成 AVIF/WebP、按屏幕出不同尺寸。
- `public/brand/logo.png`：官方 logo。

## 风格（2026-10-08 老板要求：明亮专业）

- 白底、深色字、留白多；品牌红只用在按钮和重点；白色和浅灰（`--bg-alt`）区块交替。`BRIEF.md` 里写的黑底"高级车行风"以这一条为准。
- 颜色只用 `src/styles/global.css` 里的变量：字 `--ink`、次要字 `--muted`、卡片 `--surface` + `--shadow-sm`、线 `--line`。品牌灰 `--grey` 在白底上太淡（2.4:1），只做三色条等装饰，不能当字色。小字要 ≥ 4.5:1；浅灰底上的红色小字用 `--red-text`。
- 动效保持安静：淡入、照片飞到车辆页的过渡；不要再加视差、背景花纹之类。

## 技术约定

- 纯静态网站，部署到 GitHub Pages（GitHub Actions 自动部署）。不需要服务器、数据库。
- 依赖越少越好；每次改完都要能 `npm run build` 成功。
- 手机优先：大部分客人是从 TikTok、WhatsApp 点进来的。
- 改完跑 `npm run build` 再跑 `npm run check`（检查坏链接、页面里漏出 "TODO"、每辆车都有 WhatsApp 按钮、库存快照只有公开栏位）。GitHub Actions 也会跑这两步。
- 读库存只经过 `src/data/source.ts` → `src/data/vehicles.ts`；`vehicles.ts` 有公开栏位白名单，其他栏位一律丢掉。
- 车卡照片在打包时按焦点（`50% 62%`）裁成 4:3（`src/lib/image-service.ts`），只是裁切和缩放。
- 车辆页图库：封面出 AVIF（WebP 备用）；第 2 张以后只出 WebP（750 / 1440 宽），打包才快。读照片尺寸要用 `isLandscape()`（`vehicles.ts`），直接读 `photo.width` 会让 Astro 把原图整张放进网站。

## 库存自动同步（第 6 阶段）

- 定价规则和成本只放在老板自己 Google 账号里的 Apps Script，**不能放进这个仓库**（代码、注释、文档、commit 讯息都不行）；仓库只存公开快照（`content/inventory.json` + 照片）。
- 资料流：老板的 Google 库存表 → 表里的私人 Apps Script（网页应用，送出已经算好的网站卖价）→ GitHub Actions 跑 `npm run sync` → `content/inventory.json` + `src/assets/cars/live/` → 打包上线。打包本身不连 Google。
- Apps Script 只送公开栏位（型号、年份、颜色、网站卖价、精选、照片）；车牌、成本、客人资料不出 Google。车辆 id 是车牌的 HMAC，反推不出车牌。Apps Script 的程序码不在仓库：要改就请老板从 Apps Script 编辑器复制给你，改好私下发回给他。
- GitHub Secrets：`STOCK_API_URL`（网页应用网址）、`STOCK_API_TOKEN`（密码，表格菜单「TnB Website → 显示网站密码」）。没设定时同步什么都不做，网站用现有快照。
- 公开仓库的 Actions 日志谁都能看：同步程序**只印数量**，不印车名、价钱、id、车牌、Drive 文件 id。
- 保护：读到 0 辆、比上次少一半以上或多一倍以上 → 不更新、报错；手动执行（Run workflow）勾 `force` 才放行。
- 定时：每小时 :07 同步，有变化才打包；每天 03:17（马来西亚时间）一定打包。每小时那次失败只出警告，每天那次和手动执行失败才亮红灯；push 时同步失败也不挡上线。
- 照片：Google Drive「TnB Website Photos」里每辆车一个文件夹（表格里自动生成的 WEBSITE 页有链接），按文件名排序，第一张是封面，最多 10 张。WEBSITE 页还有「精选」「隐藏」勾选框；都没勾精选时用 `legacy.json` 的精选车。
- `src/data/normalise.js`：品牌拆分、颜色翻译和错字、年份、网址（slug）、变速箱判断。网站打包和同步程序共用，改这里两边一起变。
