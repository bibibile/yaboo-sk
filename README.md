# yabook renew 自动签到脚本 🚀

基于 Node.js 和 Playwright 的 `yabook.blog` 每日自动化签到脚本。部署在 GitHub Actions 上，支持多账号循环执行，并通过 Telegram Bot 推送签到结果与截图。

---

## 🌟 核心特性

- **自动化执行**：依赖 GitHub Actions 定时触发，无需本地挂机。
- **无头浏览器模拟**：使用 Playwright 真实模拟浏览器登录与点击行为，签到成功率高。
- **多账号支持**：通过 JSON 数组配置，一次运行可完成多个账号签到。
- **直观通知**：签到完成后自动截取页面全图，通过 Telegram 发送图文状态反馈。

---

## 🛠️ 文件结构

将本项目部署至你的 GitHub 仓库，需包含以下核心文件：

- `app.js`：签到核心逻辑代码。
- `package.json`：项目依赖配置。
- `.github/workflows/renew.yml`：GitHub Actions 自动化工作流配置。

---

## 🚀 部署与使用指南

### 1. 准备仓库
新建一个 GitHub 仓库（例如 `yabook-renew`），并将上述三个文件上传至对应目录。**注意**：`renew.yml` 必须放置在 `.github/workflows/` 目录下。

### 2. 配置环境变量 (Secrets)
进入你的仓库主页，依次点击 `Settings` -> `Secrets and variables` -> `Actions`，点击 `New repository secret`，添加以下 **3 个**变量：

#### 🔑 `ACCOUNTS` (必填)
严格按照 JSON 数组格式填写你的 `yabook.blog` 账号和密码。
```json
[
  {
    "username": "你的yabook邮箱或用户名",
    "password": "你的yabook密码"
  }
]
##！！！注意事项：
### (如需多账号，继续在数组内添加 {} 对象并用逗号分隔即可。)下面
```json
[
  {
    "username": "账号1",
    "password": "密码1"
  },
  {
    "username": "账号2",
    "password": "密码2"
  }
]

🤖 TG_BOT_TOKEN (必填)
填写你从 Telegram @BotFather 获取的 Bot Token。
示例：855:AsaaszrUww

💬 TG_CHAT_ID (必填)
填写用于接收通知的 Telegram 个人或群组 ID。
示例：500001

3. 测试与运行
变量配置完成后，点击仓库顶部的 Actions 标签页。

在左侧菜单中选择 yabook renew。

点击右侧的 Run workflow 手动触发一次运行。

稍等片刻，即可在 Telegram 收到签到结果与截图通知！

定时任务说明：默认配置每天 UTC 时间 02:00（北京时间 10:00）自动运行一次。如需修改，请调整 renew.yml 中的 cron 表达式。

⚠️ 免责声明
本脚本仅供学习交流使用，请勿用于非法用途。使用此脚本产生的任何后果由使用者自行承担。
