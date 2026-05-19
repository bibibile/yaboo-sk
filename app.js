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

        // 监听并自动处理可能出现的网页弹窗(Alert/Confirm)
        page.on('dialog', async dialog => {
            console.log(`页面弹窗提示: ${dialog.message()}`);
            await dialog.accept();
        });

        let gainedCoins = '已执行签到流程';
        let totalCoins = '未知';

        try {
            // 1. 导航到登录页面并登录
            await page.goto('https://yabook.blog/e/member/login/'); 
            await page.locator('input[name="username"]').fill(user.username);
            await page.locator('input[name="password"]').fill(user.password);
            await page.getByRole('button', { name: /登录|登 录|Login/i }).click(); 
            await page.waitForLoadState('networkidle');

            // 2. 导航到专属签到页面
            console.log(`正在前往签到页面...`);
            await page.goto('https://yabook.blog/e/member/sign/');
            await page.waitForLoadState('networkidle');

            // 3. 执行签到动作
            try {
                console.log(`正在签到页面查找可点击的按钮...`);
                // 放宽条件：查找任何包含“签到”文本的元素（忽略具体数字或格式变化）
                const checkInButton = page.locator('text=/签到/i').first();
                await checkInButton.waitFor({ state: 'visible', timeout: 5000 });
                
                await checkInButton.click();
                console.log(`成功点击签到按钮！`);
                await page.waitForTimeout(3000); 
            } catch (e) {
                console.log(`未找到需点击的签到按钮。可能原因：访问即自动签到，或今日已签到过。`);
                gainedCoins = '可能已签到/自动签到';
            }

            // 4. 返回用户中心获取总雅币
            console.log(`正在前往用户中心获取雅币总额...`);
            await page.goto('https://yabook.blog/e/member/cp/');
            await page.waitForLoadState('networkidle');
            
            try {
                const bodyText = await page.locator('body').innerText();
                const totalMatch = bodyText.match(/雅币[^\d]*?(\d+)\s*个/);
                
                if (totalMatch && totalMatch[1]) {
                    totalCoins = totalMatch[1];
                    console.log(`成功获取当前雅币总数: ${totalCoins}`);
                } else {
                    console.log(`未能匹配到雅币总数，可能页面结构有变。`);
                }
            } catch (e) {
                console.log(`获取雅币总额时发生错误: ${e.message}`);
            }

            // 5. 截图
            const screenshotPath = `status_${user.username}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });

            // 6. 发送通知
            const finishTime = getCurrentTime();
            const successMsg = 
`🚀 *yabook 签到报告*

👤 *用户*：\`${user.username}\`
🎁 *执行状态*：\`${gainedCoins}\`
💰 *雅币总额*：\`${totalCoins}\` 个

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
