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
                    text: message
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
        channel: 'chrome', // 如果在 Linux/Docker 服务器上运行报错，可以尝试注释掉这行
    });

    for (const user of users) {
        console.log(`正在处理用户: ${user.username}`);
        const context = await browser.newContext();
        const page = await context.newPage();

        try {
            // 1. 导航到登录页面 (根据签到路径推测的常见登录路径)
            await page.goto('https://yabook.blog/e/member/login/'); 

            // 2. 填写账号密码并登录
            // 如果以下选择器不对，请根据实际网页的 input 标签修改 (如 name="email")
            await page.locator('input[name="username"]').fill(user.username);
            await page.locator('input[name="password"]').fill(user.password);
            // 匹配常见的登录按钮文本，如果没有生效请修改
            await page.getByRole('button', { name: /登录|登 录|Login/i }).click(); 

            await page.waitForLoadState('networkidle');

            // 3. 导航到你提供的每日签到页面
            console.log(`正在前往签到页面...`);
            await page.goto('https://yabook.blog/e/member/sign/');
            await page.waitForLoadState('networkidle');

            // 4. 执行签到动作兼容处理
            try {
                // 尝试寻找页面内是否还有“点击签到”之类的按钮
                // 设定较短的超时时间，因为可能仅仅访问上述 URL 就已经完成签到了
                const checkInButton = page.locator('text=/签到|点击签到|立即签到/i').first(); 
                await checkInButton.waitFor({ state: 'visible', timeout: 3000 });
                await checkInButton.click();
                await page.waitForTimeout(2000); // 给请求一点响应时间
            } catch (e) {
                console.log(`未检测到需要额外点击的签到按钮。可能访问页面已自动签到，或者今日已签到。`);
            }

            // 5. 截图并发送成功通知
            // 截图会完整保留最终页面的状态，你可以通过 Telegram 收到的图片直观判断是否真的签到成功了
            const successMsg = `🚀 *yabook 签到通知* \n\n✅ 用户 ${user.username} 已执行签到流程，请查看截图确认状态。`;
            console.log(successMsg);
            const successPath = `success_${user.username}.png`;
            await page.screenshot({ path: successPath, fullPage: true });
            await sendTelegramNotification(successMsg, successPath);

        } catch (error) {
            const errorMsg = `❌ *yabook 签到通知* \n\n❌ 用户 ${user.username} 处理失败: ${error.message}`;
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