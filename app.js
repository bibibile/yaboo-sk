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
            // 将消息格式设置为 Markdown 以支持加粗等排版
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

        let gainedCoins = '未知';
        let totalCoins = '未知';

        try {
            // 1. 导航到登录页面并登录
            await page.goto('https://yabook.blog/e/member/login/'); 
            await page.locator('input[name="username"]').fill(user.username);
            await page.locator('input[name="password"]').fill(user.password);
            await page.getByRole('button', { name: /登录|登 录|Login/i }).click(); 
            await page.waitForLoadState('networkidle');

            // 2. 导航到每日签到页面执行签到
            console.log(`正在前往签到页面...`);
            await page.goto('https://yabook.blog/e/member/sign/');
            await page.waitForLoadState('networkidle');

            try {
                console.log(`正在查找签到按钮...`);
                // 模糊匹配包含“签到雅币+”的按钮，为了提取里面的数字
                const checkInButton = page.locator('text=/签到雅币\\s*\\+\\s*\\d+/i').first();
                await checkInButton.waitFor({ state: 'visible', timeout: 5000 });
                
                // 提取按钮上的文字，比如“签到雅币+5”
                const buttonText = await checkInButton.innerText();
                // 用正则提取出数字部分
                const match = buttonText.match(/\+(\d+)/);
                if (match && match[1]) {
                    gainedCoins = match[1];
                }

                await checkInButton.click();
                console.log(`成功点击签到按钮，预计获得 ${gainedCoins} 雅币！`);
                await page.waitForTimeout(3000); 
            } catch (e) {
                console.log(`未找到需点击的签到按钮，可能今日已签到。`);
                gainedCoins = '0 (可能已签到)';
            }

            // 3. 导航到用户中心获取总雅币
            console.log(`正在前往用户中心获取雅币总额...`);
            await page.goto('https://yabook.blog/e/member/cp/');
            await page.waitForLoadState('networkidle');
            
            try {
                // 尝试查找包含“雅币总数量”和数字的文本
                // 这里使用了一个较宽泛的定位方式，如果页面结构复杂可能需要调整
                const coinTextLocator = page.locator('text=/雅币总数量[：:]\\s*\\d+/i').first();
                await coinTextLocator.waitFor({ state: 'visible', timeout: 5000 });
                const fullCoinText = await coinTextLocator.innerText();
                
                // 从类似“雅币总数量：65个”中提取出数字 65
                const totalMatch = fullCoinText.match(/雅币总数量[：:]\s*(\d+)/i);
                if (totalMatch && totalMatch[1]) {
                    totalCoins = totalMatch[1];
                    console.log(`成功获取当前雅币总数: ${totalCoins}`);
                }
            } catch (e) {
                console.log(`未能在页面上直接找到包含“雅币总数量：XX”的文本。`);
                // 如果上面没找到，尝试只找页面里的“雅币”附近的数字，这里仅作为兜底
            }

            // 4. 截图 (截取用户中心页面)
            const screenshotPath = `status_${user.username}.png`;
            await page.screenshot({ path: screenshotPath, fullPage: true });

            // 5. 组合 Markdown 格式的消息并发送
            const successMsg = 
`🚀 *yabook 签到报告*

👤 *用户*：\`${user.username}\`
🎁 *今日签到*：\`+${gainedCoins}\` 雅币
💰 *雅币总额*：\`${totalCoins}\` 个

_运行状态：✅ 执行完毕_`;
            
            await sendTelegramNotification(successMsg, screenshotPath);

        } catch (error) {
            const errorMsg = 
`❌ *yabook 签到报错*

👤 *用户*：\`${user.username}\`
⚠️ *错误信息*：\`${error.message}\``;

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
