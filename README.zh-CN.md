# Portfolio 投资账本

[English](README.md)

可自行部署的投资账本，支持股票、ETF、加密货币和现金。可以管理多个账户，记录买卖与币币兑换，并查看估值和盈亏。项目使用 Next.js、React、TypeScript 和 SQLite，云端可使用 Supabase Postgres。

## 本机启动

安装 Node.js 24 和 npm。在项目目录运行：

```sh
npm ci
npm run dev
```

打开 <http://127.0.0.1:3000>。应用只监听本机地址，首次运行是空账本。本机默认使用 `data/portfolio.sqlite` 保存数据，无需登录。若要运行本地生产版本，先执行 `npm run build`，再执行 `npm start`。

## 开始使用

1. 点 **+** 添加资产并创建账户，填写代码、数量、计价币种与平均成本。成本未知时可留空。
2. 支持的代码可选择自动行情，也可以手动输入价格。通过 **⋯ → Refresh prices** 可主动刷新。查看估值前可在持仓详情核对报价时间。
3. 通过 **⋯ → Trade history → Record trade** 记录买入、卖出或币币兑换。填写实际成交时间、数量、成交价和手续费。买卖可选择是否同步同账户、同币种的现金。
4. 点开持仓可查看数量、成本、报价时间、今日盈亏、浮动盈亏与最近成交。**Trade history** 默认显示成交，可切换至全部活动。

买卖只用于记账。应用会向外部行情源获取报价，不连接券商或交易所账户，也不实际下单。行情可能延迟，数据不足时会显示为不可用。资产曲线展示总资产，入金和出金都会影响曲线。今日价格盈亏按北京时间零点起算，不含手续费和汇兑变动。浮动盈亏按记录价格与平均成本的差额计算。

## 自行部署到云端

云端部署可选。需要部署时，请注册自己的 [Vercel](https://vercel.com/signup) 和 [Supabase](https://supabase.com/dashboard/sign-up) 账号，并将代码复制到自己名下的 GitHub 仓库。网站和数据库都在你自己的账号下创建，使用自己生成的密钥。

1. 创建一个新的 Supabase 项目，在 SQL Editor 中按顺序逐个执行：
   - `supabase/migrations/20260930_portfolio.sql`
   - `supabase/migrations/20261031_multi_user.sql`
   - `supabase/migrations/20261031_fixed_valuations.sql`
2. 在 Vercel 导入自己的仓库，框架选 Next.js，Node.js 版本选 24。先确定自己的正式 HTTPS 网址。
3. 配置以下生产环境变量。密钥只放服务端，勿提交到 Git，也不要使用 `NEXT_PUBLIC_` 前缀。

   | 环境变量 | 填写方式 |
   | --- | --- |
   | `PORTFOLIO_STORAGE` | 填 `supabase` |
   | `SUPABASE_URL` | 你的 Supabase 项目网址 |
   | `SUPABASE_SERVICE_ROLE_KEY` | 你的 Supabase 服务端 service-role 密钥 |
   | `PORTFOLIO_ORIGIN` | 正式站点的 HTTPS 源地址，例如 `https://your-app.vercel.app`，不带路径 |
   | `PORTFOLIO_SESSION_SECRET` | 至少 32 字符的随机会话密钥 |
   | `CRON_SECRET` | 定时估值用的独立随机密钥，至少 32 字符 |

   可以分别运行 `openssl rand -hex 32` 生成两个不同的密钥。

4. 创建第一个账号。将 `.env.example` 复制为私密的 `.env.local`，填好新数据库的云端配置。在仓库外用私密 JSON 文件保存下列格式，并替换示例账号和密码。

   ```json
   [{"username":"my_account","password":"replace-with-a-unique-strong-password"}]
   ```

   ```sh
   PORTFOLIO_USERS_FILE=/absolute/path/to/users.private.json \
     node --env-file=.env.local --import tsx scripts/create-users.ts
   ```

   已存在的账号会跳过。把密码保存到密码管理器后，删除初始化文件。云端必须登录，每个账号的账本独立保存。若仅想给本地 SQLite 加登录，在 `.env.local` 设置 `PORTFOLIO_AUTH_ENABLED=1` 和会话密钥，不配置云端变量，再运行同一账号脚本。

5. 部署后登录，确认账本初始为空。在另一个未登录窗口访问 `/api/portfolio`，确认返回 HTTP 401。`vercel.json` 中的任务会请求记录北京时间零点估值。

从本机迁移时，先导出完整 JSON 备份，再登录目标账号导入。导入会替换该账号的账本。本机和云端不会自动同步。

## 可选 AI 与数据隐私

配置服务端变量 `DEEPSEEK_API_KEY` 后，可从 **⋯ → AI Assistant** 使用助手。`DEEPSEEK_MODEL` 默认是 `deepseek-flash`。使用时，消息和部分账本信息会发给 DeepSeek。若为该次请求开启记账权限，助手可以写入账本。不配置密钥即可保持这项集成关闭。

数据库、备份、截图、账号初始化文件和环境变量文件应私下保存。通过 **⋯ → Backup & export** 可导出完整 JSON 和持仓 CSV，其中可能包含敏感财务信息。不要将导出文件提交到 Git，每套部署使用独立的数据库与密钥。

## 开发与验证

```sh
npm run typecheck
npm test
npm run build
```

可通过 `PORTFOLIO_DATA_DIR` 为本地测试指定独立数据目录。
