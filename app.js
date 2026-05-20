const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

// Telegram API 配置
const TG_CHAT_ID = process.env.TG_CHAT_ID || '520000061';
const TG_BOT_TOKEN = process.env.TG_BOT_TOKEN || '8558346335:AAHq1nZIlMbtmow0Am_YZ9PYxoLy4kzrUww';
const ACCOUNTS = process.env.ACCOUNTS || `
[
    {
        "username": "", 
        "password": ""  
    }
]`; 

async function sendTelegramNotification(message, imagePath = null) {
    if (!TG_BOT_TOKEN || !TG_CHAT_ID) {
        console.log('未设置 Telegram Bot Token 或 Chat ID，跳过通知。');
        return;
    }

    try {
        if (imagePath) {
            const formData = new FormData();
            formData.append('chat_id', TG_CHAT_ID);
            formData.append('caption', message);
            formData.append('parse_mode', 'Markdown');

            const fileBuffer = fs.readFileSync(imagePath);
            const blob = new Blob([fileBuffer]);
            formData.append('photo', blob, path.basename(imagePath));

            const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendPhoto`, {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                console.error('Telegram 图片发送失败:', await response.text());
            } else {
                console.log('Telegram 通知(含图片)已发送');
            }
        } else {
            const response = await fetch(`https://api.telegram.org/bot${TG_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: TG_CHAT_ID,
                    text: message,
                    parse_mode: 'Markdown'
                })
            });

            if (!response.ok) {
                console.error('Telegram 消息发送失败:', await response.text());
            } else {
                console.log('Telegram 文字通知已发送');
            }
        }
    } catch (error) {
        console.error('发送 Telegram 通知时出错:', error);
    }
}

// 获取格式化的北京时间
function getCurrentTime() {
    return new Date().toLocaleString('zh-CN', { 
        timeZone: 'Asia/Shanghai', 
        hour12: false,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
    }).replace(/\//g, '-');
}

// 封装提取雅币总额的函数
async function getTotalCoins(page) {
    try {
        const bodyText = await page.locator('body').innerText();
        const totalMatch = bodyText.match(/雅币[^\d]*?(\d+)\s*个/);
        if (totalMatch && totalMatch[1]) {
            return parseInt(totalMatch[1], 10);
        }
    } catch (e) {
        console.error(`提取雅币总数失败: ${e.message}`);
    }
    return null; 
}

(async () => {
    let users = [];
    try {
        if (process.env.ACCOUNTS) {
            users = JSON.parse(process.env.ACCOUNTS);
            if (!Array.isArray(users)) {
                console.error('ACCOUNTS 必须是对象数组。');
                process.exit(1);
            }
        } else {
            console.log('未找到 ACCOUNTS 环境变量，使用默认配置。');
            users = JSON.parse(ACCOUNTS);
        }
    } catch (err) {
        console.error('解析 ACCOUNTS 出错:', err);
        process.exit(1);
    }

    const browser = await chromium.launch({
        headless: true,
        channel: 'chrome', 
    });

    for (const user of users) {
        console.log(`正在处理用户: ${user.username}`);
        const context = await browser.newContext();
        const page = await context.newPage();

        let beforeCoins = null;
        let afterCoins = null;
        let siteAlertMsg = '无弹窗反馈'; // 新增：用于记录网站真实的弹窗提示

        // 监听并自动处理网页弹窗，同时将弹窗文字记录下来
        page.on('dialog', async dialog => {
            siteAlertMsg = dialog.message();
            console.log(`【拦截到网页弹窗】: ${siteAlertMsg}`);
            await dialog.accept();
        });

        try {
            // 1. 登录
            await page.goto('https://yabook.blog/e/member/login/'); 
            await page.locator('input[name="username"]').fill(user.username);
            await page.locator('input[name="password"]').fill(user.password);
            await page.getByRole('button', { name: /登录|登 录|Login/i }).click(); 
            await page.waitForLoadState('networkidle');
            await page.waitForTimeout(2000); 

            // 2. 获取签到前总额
            await page.goto('https://yabook.blog/e/member/cp/');
            await page.waitForLoadState('networkidle');
            beforeCoins = await getTotalCoins(page);

            // 3. 执行签到
            await page.goto('https://yabook.blog/e/member/sign/');
            await page.waitForLoadState('domcontentloaded');

            try {
                const checkInButton = page.locator('text=/签到/').first();
                await checkInButton.waitFor({ state: 'visible', timeout: 5000 });
                // 使用 dispatchEvent 强制触发点击，无视一切网页遮挡物
                await checkInButton.dispatchEvent('click');
                console.log(`已强制触发签到点击动作！`);
                // 等待足够长的时间让弹窗出现并被拦截
                await page.waitForTimeout(4000); 
            } catch (e) {
                console.log(`未找到签到按钮。`);
            }

            // 4. 获取签到后总额
            await page.goto('https://yabook.blog/e/member/cp/');
            await page.waitForLoadState('networkidle');
            afterCoins = await getTotalCoins(page);

            // 5. 计算差值
            let gainedCoinsStr = '未知';
            if (beforeCoins !== null && afterCoins !== null) {
                const diff = afterCoins - beforeCoins;
                if (diff > 0) {
                    gainedCoinsStr = `+${diff}`;
                } else {
                    gainedCoinsStr = `0`;
                }
            }

            let displayTotalCoins = afterCoins !== null ? afterCoins : (beforeCoins !== null ? beforeCoins : '未知');

            // 6. 截图保存
            const screenshotPath = `status_${user.username}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });

            // 7. 发送最终报告 (加入网站真实反馈)
            const finishTime = getCurrentTime();
            const successMsg = 
`🚀 *yabook 签到报告*

👤 *用户*：\`${user.username}\`
💬 *网站反馈*：\`${siteAlertMsg}\`
🎁 *实际收益*：\`${gainedCoinsStr}\` 雅币
💰 *最新总额*：\`${displayTotalCoins}\` 个

_运行状态：✅ 执行完毕_
_完成时间：${finishTime}_`;
            
            await sendTelegramNotification(successMsg, screenshotPath);

        } catch (error) {
            const finishTime = getCurrentTime();
            const errorMsg = 
`❌ *yabook 签到报错*

👤 *用户*：\`${user.username}\`
⚠️ *错误信息*：\`${error.message}\`

_完成时间：${finishTime}_`;

            console.error(errorMsg);
            const errorPath = `error_${user.username}.png`;
            await page.screenshot({ path: errorPath, fullPage: true });
            await sendTelegramNotification(errorMsg, errorPath);
        } finally {
            await context.close();
        }
    }

    await browser.close();
})();
