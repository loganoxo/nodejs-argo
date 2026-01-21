const express = require("express");
const app = express();
const axios = require("axios");
const os = require('os');
const fs = require("fs");
const path = require("path");
const { promisify } = require('util');
const exec = promisify(require('child_process').exec);
const { execSync } = require('child_process');        // 只填写UPLOAD_URL将上传节点,同时填写UPLOAD_URL和PROJECT_URL将上传订阅
const UPLOAD_URL = process.env.UPLOAD_URL || '';      // 节点或订阅自动上传地址,需填写部署Merge-sub项目后的首页地址,例如：https://merge.xxx.com
const PROJECT_URL = process.env.PROJECT_URL || '';    // 需要上传订阅或保活时需填写项目分配的url,例如：https://google.com
const AUTO_ACCESS = process.env.AUTO_ACCESS || false; // false关闭自动保活，true开启,需同时填写PROJECT_URL变量
const FILE_PATH = process.env.FILE_PATH || './tmp';   // 运行目录,sub节点文件保存目录
let SUB_PATH = process.env.A || process.env.SUB_PATH || 'a';       // 订阅路径
const PORT = process.env.Z1 || process.env.SERVER_PORT || process.env.PORT || 40080;        // http服务订阅端口
let UUID = process.env.B || process.env.UUID || '3771dd21-3ef0-44d7-810f-dbdfccac3918'; // 使用哪吒v1,在不同的平台运行需修改UUID,否则会覆盖
let NEZHA_SERVER = process.env.N1 || process.env.NEZHA_SERVER || '';        // 哪吒v1填写形式: nz.abc.com:8008  哪吒v0填写形式：nz.abc.com
let NEZHA_PORT = process.env.N2 || process.env.NEZHA_PORT || '';            // 使用哪吒v1请留空，哪吒v0需填写
let NEZHA_KEY = process.env.N3 || process.env.NEZHA_KEY || '';              // 哪吒v1的NZ_CLIENT_SECRET或哪吒v0的agent密钥
let ARGO_DOMAIN = process.env.C || process.env.ARGO_DOMAIN || 'c';          // 固定隧道域名,留空即启用临时隧道
let ARGO_AUTH = process.env.D || process.env.ARGO_AUTH || 'd';              // 固定隧道密钥json或token,留空即启用临时隧道,json获取地址：https://json.zone.id
const ARGO_PORT = process.env.Z2 || process.env.ARGO_PORT || 8001;            // 固定隧道端口,使用token需在cloudflare后台设置和这里一致
const CFIP = process.env.CFIP || 'cdns.doon.eu.org';        // 节点优选域名或优选ip
const CFPORT = process.env.CFPORT || 443;                   // 节点优选域名或优选ip对应的端口
let NAME = process.env.E || process.env.NAME || 'railway';                        // 节点名称

//解密
const crypto = require("crypto")
const key = crypto.createHash("sha256").update("bbMXwj24nhu73o4A").digest() // 生成 32 字节密钥
const iv = Buffer.from("GddgwiSJj4hHsw72") // 固定 16 字节 IV（也可自定义）
function decrypt(encrypted) {
    let encryptedBuf = Buffer.from(encrypted, "base64")
    let decipher = crypto.createDecipheriv("aes-256-cbc", key, iv)
    let decrypted = decipher.update(encryptedBuf)
    decrypted = Buffer.concat([decrypted, decipher.final()])
    return decrypted.toString("utf8")
}
SUB_PATH = decrypt(SUB_PATH)
UUID = decrypt(UUID)
ARGO_DOMAIN = decrypt(ARGO_DOMAIN)
ARGO_AUTH = decrypt(ARGO_AUTH)
NAME = decrypt(NAME)
NEZHA_SERVER = decrypt(NEZHA_SERVER)
NEZHA_PORT = decrypt(NEZHA_PORT)
NEZHA_KEY = decrypt(NEZHA_KEY)

// 创建运行文件夹
if (!fs.existsSync(FILE_PATH)) {
  fs.mkdirSync(FILE_PATH);
  console.log(`${FILE_PATH} is created`);
} else {
  console.log(`${FILE_PATH} already exists`);
}

// 生成随机6位字符文件名
function generateRandomName() {
  const characters = 'abcdefghijklmnopqrstuvwxyz';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
}

// 全局常量
const npmName = generateRandomName();
const webName = generateRandomName();
const botName = generateRandomName();
const phpName = generateRandomName();
let npmPath = path.join(FILE_PATH, npmName);
let phpPath = path.join(FILE_PATH, phpName);
let webPath = path.join(FILE_PATH, webName);
let botPath = path.join(FILE_PATH, botName);
let subPath = path.join(FILE_PATH, 'sub.txt');
let listPath = path.join(FILE_PATH, 'list.txt');
let bootLogPath = path.join(FILE_PATH, 'boot.log');
let configPath = path.join(FILE_PATH, 'config.json');

// 如果订阅器上存在历史运行节点则先删除
function deleteNodes() {
  try {
    if (!UPLOAD_URL) return;
    if (!fs.existsSync(subPath)) return;

    let fileContent;
    try {
      fileContent = fs.readFileSync(subPath, 'utf-8');
    } catch {
      return null;
    }

    const decoded = Buffer.from(fileContent, 'base64').toString('utf-8');
    const nodes = decoded.split('\n').filter(line =>
      /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line)
    );

    if (nodes.length === 0) return;

    axios.post(`${UPLOAD_URL}/api/delete-nodes`,
      JSON.stringify({ nodes }),
      { headers: { 'Content-Type': 'application/json' } }
    ).catch((error) => {
      return null;
    });
    return null;
  } catch (err) {
    return null;
  }
}

// 清理历史文件
function cleanupOldFiles() {
  try {
    const files = fs.readdirSync(FILE_PATH);
    files.forEach(file => {
      const filePath = path.join(FILE_PATH, file);
      try {
        const stat = fs.statSync(filePath);
        if (stat.isFile()) {
          fs.unlinkSync(filePath);
        }
      } catch (err) {
        // 忽略所有错误，不记录日志
      }
    });
  } catch (err) {
    // 忽略所有错误，不记录日志
  }
}

function zj() {
    return `
<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>远岛日记 — 记录时间与生活的颗粒</title><style>:root{--bg:#0f1724;--card:#0b1220;--muted:#9aa6b2;--accent:#22c1c3;--glass:rgba(255, 255, 255, 0.03);--radius:16px;--maxw:1200px;--glass-2:rgba(255, 255, 255, 0.02);--gold:#f6c85f;--soft:#e6eef1;font-family:Inter,"Helvetica Neue",Arial,sans-serif;color-scheme:dark}*{box-sizing:border-box;margin:0;padding:0}body,html{height:100%}body{background:radial-gradient(1200px 600px at 10% 10%,rgba(34,193,195,.06),transparent 12%),radial-gradient(900px 400px at 90% 90%,rgba(186,104,200,.04),transparent 12%),var(--bg);color:var(--soft);-webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;line-height:1.6;padding:36px 20px;display:flex;justify-content:center;align-items:flex-start;font-size:16px}.container{width:100%;max-width:var(--maxw);display:grid;grid-template-columns:1fr 340px;gap:28px;align-items:start}.header{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:20px;margin-bottom:18px}.brand{display:flex;align-items:center;gap:16px}.logo{width:68px;height:68px;border-radius:14px;background:linear-gradient(135deg,var(--accent),#a55bd8);display:flex;align-items:center;justify-content:center;font-weight:700;font-size:20px;color:#021321;box-shadow:0 8px 30px rgba(2,19,33,.6),inset 0 -6px 18px rgba(255,255,255,.03)}.title{font-size:20px;font-weight:700;letter-spacing:.2px}.subtitle{font-size:13px;color:var(--muted);margin-top:4px}.main{background:linear-gradient(180deg,var(--card),rgba(11,18,32,.9));border-radius:var(--radius);padding:28px;box-shadow:0 10px 40px rgba(2,10,20,.6);border:1px solid var(--glass);overflow:hidden}.feature{display:flex;gap:22px;align-items:stretch;margin-bottom:22px}.feature .hero{flex:1;border-radius:12px;padding:22px;background:linear-gradient(180deg,rgba(255,255,255,.02),transparent);display:flex;flex-direction:column;justify-content:flex-end;min-height:200px;position:relative;overflow:hidden}.hero h1{font-size:24px;margin-bottom:8px;color:var(--soft)}.hero p{color:var(--muted);font-size:14px;max-width:60%}.hero .meta{margin-top:12px;color:var(--muted);font-size:13px}.hero::after{content:"";position:absolute;right:-20px;top:-30px;width:260px;height:260px;background:radial-gradient(circle at 30% 30%,rgba(255,255,255,.03),transparent 30%);transform:rotate(18deg);filter:blur(14px);opacity:.9}.feature .side{width:260px;border-radius:12px;padding:18px;background:linear-gradient(180deg,rgba(255,255,255,.02),rgba(255,255,255,.01));border:1px solid var(--glass-2);display:flex;flex-direction:column;gap:12px;justify-content:center}.side .kpi{display:flex;align-items:center;justify-content:space-between}.kpi .num{font-weight:700;font-size:18px}.kpi .label{color:var(--muted);font-size:13px}.posts{display:flex;flex-direction:column;gap:18px}.post{display:grid;grid-template-columns:1fr 220px;gap:18px;padding:16px;border-radius:12px;background:linear-gradient(180deg,rgba(255,255,255,.01),transparent);border:1px solid rgba(255,255,255,.02)}.post h2{margin-bottom:6px;font-size:18px}.post .excerpt{color:var(--muted);font-size:14px;margin-bottom:10px}.post .metaRow{display:flex;gap:10px;color:var(--muted);font-size:13px;flex-wrap:wrap}.post .thumb{width:220px;border-radius:10px;overflow:hidden;background:linear-gradient(135deg,#12242b,#0b1230);display:flex;align-items:center;justify-content:center;font-size:13px;color:var(--muted);padding:12px;min-height:120px}.tag{display:inline-block;padding:6px 10px;border-radius:999px;background:rgba(255,255,255,.02);color:var(--muted);font-size:12px;border:1px solid var(--glass-2)}.sidebar{position:sticky;top:36px;align-self:start;display:flex;flex-direction:column;gap:18px}.card{background:linear-gradient(180deg,rgba(255,255,255,.02),transparent);border-radius:12px;padding:18px;border:1px solid var(--glass-2)}.about h3{font-size:16px;margin-bottom:8px}.about p{color:var(--muted);font-size:14px}.search{display:flex;gap:10px;align-items:center}.search input{width:100%;background:0 0;border:1px solid rgba(255,255,255,.03);padding:10px 12px;border-radius:10px;color:var(--soft);outline:0;font-size:14px}.recent li{margin-bottom:10px;list-style:none}.archive{display:flex;flex-direction:column;gap:8px}.tagCloud{display:flex;flex-wrap:wrap;gap:8px}.footer{grid-column:1/-1;margin-top:18px;color:var(--muted);font-size:13px;display:flex;justify-content:space-between;align-items:center;gap:12px}@media (max-width:1000px){.container{grid-template-columns:1fr;padding-bottom:40px}.main{order:2}.sidebar{order:1;position:relative;top:0}.post{grid-template-columns:1fr;align-items:center}.feature{flex-direction:column}.feature .side{width:100%}.hero p{max-width:100%}}</style></head><body><div class="container"><header class="header"><div class="brand"><div class="logo">RY</div><div><div class="title">远岛日记</div><div class="subtitle">摄影、阅读与虚度的时光</div></div></div><nav style="color:var(--muted);font-size:14px;display:flex;gap:18px;align-items:center"><div>关于我</div><div>图集</div><div>书单</div><div>来信</div></nav></header><main class="main" aria-label="主内容"><section class="feature" aria-hidden="false"><div class="hero"><div style="display:flex;justify-content:space-between;align-items:flex-start"><div><h1>在季节的缝隙里：关于独处的练习</h1><p>摄影不仅是记录，更是一种观看世界的方式. 这篇随笔整理了秋天在山中的胶片影像、重读经典的感悟以及几件耐用的器物，希望你能在阅读中感受到片刻的宁静.</p><div class="meta">记录者： 林远 · 2025-10-18 · 阅读约 8 分钟</div></div><div style="text-align:right;color:var(--gold);font-weight:700">置顶</div></div></div><aside class="side" aria-label="侧栏概览"><div class="kpi"><div><div class="num">1.2k+</div><div class="label">本月访客</div></div><div style="text-align:right"><div class="num">342</div><div class="label">篇日记</div></div></div><div style="height:8px"></div><div style="font-size:13px;color:var(--muted)">最新更新</div><div style="display:flex;flex-direction:column;gap:6px"><div style="font-size:14px">胶片里的颗粒感：被遗忘的温柔</div><div style="font-size:14px">京都漫步：寻找一家没有名字的咖啡馆</div><div style="font-size:14px">断舍离后的居住空间与内心秩序</div></div></aside></section><section class="posts" aria-label="文章列表"><article class="post"><div class="left"><h2>胶片里的颗粒感：那些被数码时代遗忘的温柔</h2><div class="excerpt">在追求高清直出的年代，胶片的不可预测性反倒成了一种奢侈的浪漫. 这篇文章记录了用 Contax T3 拍摄的一组街头影像，探讨关于等待、冲洗与意外曝光的美学。</div><div class="metaRow"><div>作者： 林远</div><div>·</div><div>2025-09-02</div><div>·</div><div class="tag">摄影</div><div class="tag">生活美学</div></div><div style="margin-top:12px;color:var(--muted);font-size:14px">按快门不再是廉价的动作，每一张底片都对应着真实的银盐成本和某种郑重其事。 第一卷是在傍晚的河边拍完的，蓝调时刻的光线并不完美，但那种粗糙的颗粒感 却还原了记忆最原本的质地，没有过度锐化，只有模糊而温暖的情绪...</div></div><div class="thumb">傍晚街道的胶片质感</div></article><article class="post"><div class="left"><h2>京都漫步：寻找一家没有名字的咖啡馆</h2><div class="excerpt">没有打卡清单，也没有必去的景点，只是一次随性的城市散步。如何在陌生的街区里建立临时的归属感？本文分享了几条私藏的散步路线与背包里的必备小物。</div><div class="metaRow"><div>作者： 林远</div><div>·</div><div>2025-08-19</div><div>·</div><div class="tag">旅行</div><div class="tag">独处</div></div><div style="margin-top:12px;color:var(--muted);font-size:14px">真正的旅行往往开始于迷路之后。那天误入了一条只有老人和猫的小巷， 意外发现一家只卖手冲的老店。店主不怎么说话，只专注于水流与粉层的接触， 这种专注本身就是一种治愈。旅行不再是为了抵达，而是为了在移动中重新找回感官...</div></div><div class="thumb">咖啡馆角落的光影</div></article><article class="post"><div class="left"><h2>断舍离后的居住空间与内心秩序</h2><div class="excerpt">物品的堆积往往是内心焦虑的投射. 我花了三个周末清理了书房和衣柜，把物品数量减少了 40%， 并附上了关于收纳逻辑与极简生活的思考。</div><div class="metaRow"><div>作者： 林远</div><div>·</div><div>2025-07-30</div><div>·</div><div class="tag">家居</div><div class="tag">极简主义</div></div><div style="margin-top:12px;color:var(--muted);font-size:14px">扔掉东西并不难，难的是面对那些“将来可能会用到”的执念。 当我把多余的装饰画取下，留出一面原本的白墙时，才发现空间的呼吸感 比任何装饰都昂贵。生活不需要那么多选项，需要的只是一些确定的、真正喜欢的事物...</div></div><div class="thumb">极简风格的白色房间</div></article><article class="post"><div class="left"><h2>手冲咖啡的变量控制：水温、流速与清晨仪式</h2><div class="excerpt">对于许多人来说，清晨的第一杯咖啡是唤醒大脑的开关. 本文不聊复杂的产地风味，只聊如何通过简单的器具，稳定地获得一杯口感干净的日晒耶加雪菲。</div><div class="metaRow"><div>作者： 林远</div><div>·</div><div>2025-06-15</div><div>·</div><div class="tag">咖啡</div><div class="tag">日常</div></div><div style="margin-top:12px;color:var(--muted);font-size:14px">建议的做法包括：哪怕多花几秒钟也要润湿滤纸、把水温控制在92度左右、 以及不要在这个过程中看手机。专注于注水时的泡沫升起与回落， 这短短的三分钟，是属于你一个人的冥想时间...</div></div><div class="thumb">手冲壶与滤杯特写</div></article><article class="post"><div class="left"><h2>重读经典：在快餐时代寻找沉得下去的文字</h2><div class="excerpt">阅读不应该是为了积累谈资. 通过重新阅读这 5 本旧书，我发现经典之所以成为经典，是因为它们总能在不同的人生阶段提供新的回响。</div><div class="metaRow"><div>作者： 林远</div><div>·</div><div>2025-05-04</div><div>·</div><div class="tag">阅读</div><div class="tag">思考</div></div><div style="margin-top:12px;color:var(--muted);font-size:14px">这五本书关于孤独、关于流浪、关于人性的幽微之处。 在这个短视频和碎片化信息轰炸的时代，能够花两个下午完整地读完一本大部头， 这种体验本身就是一种对抗遗忘的胜利...</div></div><div class="thumb">旧书店的书架一角</div></article><article class="post"><div class="left"><h2>秋日东京：旧书店、爵士乐与雨天的散步</h2><div class="excerpt">这是一篇私人旅行日记，记录了在神保町淘书的下午、在新宿一家老派爵士喫茶店听完一张黑胶唱片的时光，以及几家适合发呆的公园。</div><div class="metaRow"><div>作者： 林远</div><div>·</div><div>2024-11-12</div><div>·</div><div class="tag">旅行</div><div class="tag">随笔</div></div><div style="margin-top:12px;color:var(--muted);font-size:14px">推荐的地方有：神保町的一家专营艺术画册的二手书店，适合消磨整个雨天； 还有代官山的一处僻静角落，看着路人撑伞走过，世界仿佛被按下了静音键...</div></div><div class="thumb">东京雨后的街道</div></article><article class="post"><div class="left"><h2>阳台植物观察：关于生长、枯萎与耐心的修剪</h2><div class="excerpt">养植物是观察时间流逝最好的方式. 本文记录了龟背竹与琴叶榕的生长状态，以及我在照顾它们过程中学到的关于“等待”的哲学。</div><div class="metaRow"><div>作者： 林远</div><div>·</div><div>2025-03-08</div><div>·</div><div class="tag">植物</div><div class="tag">治愈</div></div><div style="margin-top:12px;color:var(--muted);font-size:14px">关键在于接受枯萎也是生命的一部分：不要因为一片叶子的发黄而焦虑， 适时的修剪是为了更好的萌发。每天清晨给它们浇水的时候， 看着新抽出的嫩芽，会让人觉得生活依然充满希望...</div></div><div class="thumb">阳光下的绿植叶片</div></article><article class="post"><div class="left"><h2>黑胶唱片的B面：那些不被推荐的隐秘角落</h2><div class="excerpt">在流媒体音乐唾手可得的今天，听黑胶成了一种笨拙的坚持. 我分享了几张近期常听的爵士与环境音乐唱片，以及它们背后的故事。</div><div class="metaRow"><div>作者： 林远</div><div>·</div><div>2025-02-20</div><div>·</div><div class="tag">音乐</div><div class="tag">收藏</div></div><div style="margin-top:12px;color:var(--muted);font-size:14px">拿起唱片、擦拭灰尘、放下唱针，这些繁琐的物理动作让听音乐这件事重新变得具有仪式感。 有时候，正是那些不完美的爆豆声，提醒着我们此刻是真实存在的...</div></div><div class="thumb">黑胶唱机与唱片封面</div></article><article class="post"><div class="left"><h2>深夜食堂的复刻：用食物治愈疲惫的都市灵魂</h2><div class="excerpt">做饭不仅仅是为了果腹，更是一种自我照顾. 这道简单的日式土豆炖肉，适合在某个不想说话的周末夜晚，慢慢炖煮，慢慢品尝。</div><div class="metaRow"><div>作者： 林远</div><div>·</div><div>2024-12-05</div><div>·</div><div class="tag">美食</div><div class="tag">烹饪</div></div><div style="margin-top:12px;color:var(--muted);font-size:14px">建议选购肥瘦相间的五花肉，先煎出油脂，再放入切成滚刀块的土豆和胡萝卜。 看着锅里咕嘟咕嘟冒着热气，厨房里弥漫着酱油和味淋的香气， 一天的疲惫仿佛也就这样随之蒸发了...</div></div><div class="thumb">温暖的炖煮料理</div></article></section></main><aside class="sidebar" aria-label="侧边栏"><div class="card about"><h3>关于作者</h3><p>林远，自由撰稿人与摄影爱好者，喜欢在城市边缘散步. 他热衷于胶片摄影、古典爵士与手冲咖啡，相信通过记录微小的日常，能抵御时间的流逝。</p></div><div class="card"><div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px"><div style="font-weight:700">兴趣标签</div><div style="color:var(--muted);font-size:13px">随机排列</div></div><div class="tagCloud"><div class="tag">摄影</div><div class="tag">咖啡</div><div class="tag">阅读</div><div class="tag">极简主义</div><div class="tag">黑胶</div><div class="tag">旅行</div><div class="tag">植物</div><div class="tag">烹饪</div></div></div><div class="card"><div style="font-weight:700;margin-bottom:8px">时光存档</div><div class="archive"><div>2025 年 · 34 篇</div><div>2024 年 · 78 篇</div><div>2023 年 · 52 篇</div></div></div><div class="card"><div style="font-weight:700;margin-bottom:8px">订阅</div><div style="color:var(--muted);font-size:14px">输入邮箱，每月收到一封关于生活美学的信：</div><div style="margin-top:10px"><input placeholder="example@domain.com" style="width:100%;padding:10px;border-radius:8px;background:0 0;border:1px solid rgba(255,255,255,.03);color:var(--soft);outline:0"></div></div></aside><footer class="footer"><div>© 2025 远岛日记 · 保留所有权利</div><div style="color:var(--muted)">文字与图片均为原创，转载请注明</div></footer></div></body></html>
`;
}

// 根路由
app.get("/", function(req, res) {
  res.set("Content-Type", "text/html; charset=utf-8");
  res.send(zj());
});

// 生成xr-ay配置文件
async function generateConfig() {
  const config = {
    log: { access: '/dev/null', error: '/dev/null', loglevel: 'none' },
    inbounds: [
      { port: ARGO_PORT, protocol: 'vless', settings: { clients: [{ id: UUID, flow: 'xtls-rprx-vision' }], decryption: 'none', fallbacks: [{ dest: 3001 }, { path: "/vless-argo", dest: 3002 }, { path: "/vmess-argo", dest: 3003 }, { path: "/trojan-argo", dest: 3004 }] }, streamSettings: { network: 'tcp' } },
      { port: 3001, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID }], decryption: "none" }, streamSettings: { network: "tcp", security: "none" } },
      { port: 3002, listen: "127.0.0.1", protocol: "vless", settings: { clients: [{ id: UUID, level: 0 }], decryption: "none" }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/vless-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3003, listen: "127.0.0.1", protocol: "vmess", settings: { clients: [{ id: UUID, alterId: 0 }] }, streamSettings: { network: "ws", wsSettings: { path: "/vmess-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
      { port: 3004, listen: "127.0.0.1", protocol: "trojan", settings: { clients: [{ password: UUID }] }, streamSettings: { network: "ws", security: "none", wsSettings: { path: "/trojan-argo" } }, sniffing: { enabled: true, destOverride: ["http", "tls", "quic"], metadataOnly: false } },
    ],
    dns: { servers: ["https+local://8.8.8.8/dns-query"] },
    outbounds: [ { protocol: "freedom", tag: "direct" }, {protocol: "blackhole", tag: "block"} ]
  };
  fs.writeFileSync(path.join(FILE_PATH, 'config.json'), JSON.stringify(config, null, 2));
}

// 判断系统架构
function getSystemArchitecture() {
  const arch = os.arch();
  if (arch === 'arm' || arch === 'arm64' || arch === 'aarch64') {
    return 'arm';
  } else {
    return 'amd';
  }
}

// 下载对应系统架构的依赖文件
function downloadFile(fileName, fileUrl, callback) {
  const filePath = fileName;

  // 确保目录存在
  if (!fs.existsSync(FILE_PATH)) {
    fs.mkdirSync(FILE_PATH, { recursive: true });
  }

  const writer = fs.createWriteStream(filePath);

  axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  })
    .then(response => {
      response.data.pipe(writer);

      writer.on('finish', () => {
        writer.close();
        console.log(`Download ${path.basename(filePath)} successfully`);
        callback(null, filePath);
      });

      writer.on('error', err => {
        fs.unlink(filePath, () => { });
        const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
        console.error(errorMessage); // 下载失败时输出错误消息
        callback(errorMessage);
      });
    })
    .catch(err => {
      const errorMessage = `Download ${path.basename(filePath)} failed: ${err.message}`;
      console.error(errorMessage); // 下载失败时输出错误消息
      callback(errorMessage);
    });
}

// 下载并运行依赖文件
async function downloadFilesAndRun() {

  const architecture = getSystemArchitecture();
  const filesToDownload = getFilesForArchitecture(architecture);

  if (filesToDownload.length === 0) {
    console.log(`Can't find a file for the current architecture`);
    return;
  }

  const downloadPromises = filesToDownload.map(fileInfo => {
    return new Promise((resolve, reject) => {
      downloadFile(fileInfo.fileName, fileInfo.fileUrl, (err, filePath) => {
        if (err) {
          reject(err);
        } else {
          resolve(filePath);
        }
      });
    });
  });

  try {
    await Promise.all(downloadPromises);
  } catch (err) {
    console.error('Error downloading files:', err);
    return;
  }
  // 授权和运行
  function authorizeFiles(filePaths) {
    const newPermissions = 0o775;
    filePaths.forEach(absoluteFilePath => {
      if (fs.existsSync(absoluteFilePath)) {
        fs.chmod(absoluteFilePath, newPermissions, (err) => {
          if (err) {
            console.error(`Empowerment failed for ${absoluteFilePath}: ${err}`);
          } else {
            console.log(`Empowerment success for ${absoluteFilePath}: ${newPermissions.toString(8)}`);
          }
        });
      }
    });
  }
  const filesToAuthorize = NEZHA_PORT ? [npmPath, webPath, botPath] : [phpPath, webPath, botPath];
  authorizeFiles(filesToAuthorize);

  //运行ne-zha
  if (NEZHA_SERVER && NEZHA_KEY) {
    if (!NEZHA_PORT) {
      // 检测哪吒是否开启TLS
      const port = NEZHA_SERVER.includes(':') ? NEZHA_SERVER.split(':').pop() : '';
      const tlsPorts = new Set(['443', '8443', '2096', '2087', '2083', '2053']);
      const nezhatls = tlsPorts.has(port) ? 'true' : 'false';
      // 生成 config.yaml
      const configYaml = `
client_secret: ${NEZHA_KEY}
debug: false
disable_auto_update: true
disable_command_execute: false
disable_force_update: true
disable_nat: false
disable_send_query: false
gpu: false
insecure_tls: true
ip_report_period: 1800
report_delay: 4
server: ${NEZHA_SERVER}
skip_connection_count: true
skip_procs_count: true
temperature: false
tls: ${nezhatls}
use_gitee_to_upgrade: false
use_ipv6_country_code: false
uuid: ${UUID}`;

      fs.writeFileSync(path.join(FILE_PATH, 'config.yaml'), configYaml);

      // 运行 v1
      const command = `nohup ${phpPath} -c "${FILE_PATH}/config.yaml" >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log(`${phpName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`php running error: ${error}`);
      }
    } else {
      let NEZHA_TLS = '';
      const tlsPorts = ['443', '8443', '2096', '2087', '2083', '2053'];
      if (tlsPorts.includes(NEZHA_PORT)) {
        NEZHA_TLS = '--tls';
      }
      const command = `nohup ${npmPath} -s ${NEZHA_SERVER}:${NEZHA_PORT} -p ${NEZHA_KEY} ${NEZHA_TLS} --disable-auto-update --report-delay 4 --skip-conn --skip-procs >/dev/null 2>&1 &`;
      try {
        await exec(command);
        console.log(`${npmName} is running`);
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`npm running error: ${error}`);
      }
    }
  } else {
    console.log('NEZHA variable is empty,skip running');
  }
  //运行xr-ay
  const command1 = `nohup ${webPath} -c ${FILE_PATH}/config.json >/dev/null 2>&1 &`;
  try {
    await exec(command1);
    console.log(`${webName} is running`);
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.error(`web running error: ${error}`);
  }

  // 运行cloud-fared
  if (fs.existsSync(botPath)) {
    let args;

    if (ARGO_AUTH.match(/^[A-Z0-9a-z=]{120,250}$/)) {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 run --token ${ARGO_AUTH}`;
    } else if (ARGO_AUTH.match(/TunnelSecret/)) {
      args = `tunnel --edge-ip-version auto --config ${FILE_PATH}/tunnel.yml run`;
    } else {
      args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
    }

    try {
      await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
      console.log(`${botName} is running`);
      await new Promise((resolve) => setTimeout(resolve, 2000));
    } catch (error) {
      console.error(`Error executing command: ${error}`);
    }
  }
  await new Promise((resolve) => setTimeout(resolve, 5000));

}

//根据系统架构返回对应的url
function getFilesForArchitecture(architecture) {
  let baseFiles;
  if (architecture === 'arm') {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://arm64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://arm64.ssss.nyc.mn/bot" }
    ];
  } else {
    baseFiles = [
      { fileName: webPath, fileUrl: "https://amd64.ssss.nyc.mn/web" },
      { fileName: botPath, fileUrl: "https://amd64.ssss.nyc.mn/bot" }
    ];
  }

  if (NEZHA_SERVER && NEZHA_KEY) {
    if (NEZHA_PORT) {
      const npmUrl = architecture === 'arm'
        ? "https://arm64.ssss.nyc.mn/agent"
        : "https://amd64.ssss.nyc.mn/agent";
        baseFiles.unshift({
          fileName: npmPath,
          fileUrl: npmUrl
        });
    } else {
      const phpUrl = architecture === 'arm'
        ? "https://arm64.ssss.nyc.mn/v1"
        : "https://amd64.ssss.nyc.mn/v1";
      baseFiles.unshift({
        fileName: phpPath,
        fileUrl: phpUrl
      });
    }
  }

  return baseFiles;
}

// 获取固定隧道json
function argoType() {
  if (!ARGO_AUTH || !ARGO_DOMAIN) {
    console.log("ARGO_DOMAIN or ARGO_AUTH variable is empty, use quick tunnels");
    return;
  }

  if (ARGO_AUTH.includes('TunnelSecret')) {
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.json'), ARGO_AUTH);
    const tunnelYaml = `
  tunnel: ${ARGO_AUTH.split('"')[11]}
  credentials-file: ${path.join(FILE_PATH, 'tunnel.json')}
  protocol: http2

  ingress:
    - hostname: ${ARGO_DOMAIN}
      service: http://localhost:${ARGO_PORT}
      originRequest:
        noTLSVerify: true
    - service: http_status:404
  `;
    fs.writeFileSync(path.join(FILE_PATH, 'tunnel.yml'), tunnelYaml);
  } else {
    console.log("ARGO_AUTH mismatch TunnelSecret,use token connect to tunnel");
  }
}

// 获取临时隧道domain
async function extractDomains() {
  let argoDomain;

  if (ARGO_AUTH && ARGO_DOMAIN) {
    argoDomain = ARGO_DOMAIN;
    console.log('ARGO_DOMAIN:', argoDomain);
    await generateLinks(argoDomain);
  } else {
    try {
      const fileContent = fs.readFileSync(path.join(FILE_PATH, 'boot.log'), 'utf-8');
      const lines = fileContent.split('\n');
      const argoDomains = [];
      lines.forEach((line) => {
        const domainMatch = line.match(/https?:\/\/([^ ]*trycloudflare\.com)\/?/);
        if (domainMatch) {
          const domain = domainMatch[1];
          argoDomains.push(domain);
        }
      });

      if (argoDomains.length > 0) {
        argoDomain = argoDomains[0];
        console.log('ArgoDomain:', argoDomain);
        await generateLinks(argoDomain);
      } else {
        console.log('ArgoDomain not found, re-running bot to obtain ArgoDomain');
        // 删除 boot.log 文件，等待 2s 重新运行 server 以获取 ArgoDomain
        fs.unlinkSync(path.join(FILE_PATH, 'boot.log'));
        async function killBotProcess() {
          try {
            if (process.platform === 'win32') {
              await exec(`taskkill /f /im ${botName}.exe > nul 2>&1`);
            } else {
              await exec(`pkill -f "[${botName.charAt(0)}]${botName.substring(1)}" > /dev/null 2>&1`);
            }
          } catch (error) {
            // 忽略输出
          }
        }
        killBotProcess();
        await new Promise((resolve) => setTimeout(resolve, 3000));
        const args = `tunnel --edge-ip-version auto --no-autoupdate --protocol http2 --logfile ${FILE_PATH}/boot.log --loglevel info --url http://localhost:${ARGO_PORT}`;
        try {
          await exec(`nohup ${botPath} ${args} >/dev/null 2>&1 &`);
          console.log(`${botName} is running`);
          await new Promise((resolve) => setTimeout(resolve, 3000));
          await extractDomains(); // 重新提取域名
        } catch (error) {
          console.error(`Error executing command: ${error}`);
        }
      }
    } catch (error) {
      console.error('Error reading boot.log:', error);
  }
}

// 获取isp信息
async function getMetaInfo() {
  try {
    const response1 = await axios.get('https://ipapi.co/json/', { timeout: 3000 });
    if (response1.data && response1.data.country_code && response1.data.org) {
      return `${response1.data.country_code}_${response1.data.org}`;
    }
  } catch (error) {
      try {
        // 备用 ip-api.com 获取isp
        const response2 = await axios.get('http://ip-api.com/json/', { timeout: 3000 });
        if (response2.data && response2.data.status === 'success' && response2.data.countryCode && response2.data.org) {
          return `${response2.data.countryCode}_${response2.data.org}`;
        }
      } catch (error) {
        // console.error('Backup API also failed');
      }
  }
  return 'Unknown';
}
// 生成 list 和 sub 信息
async function generateLinks(argoDomain) {
  const ISP = await getMetaInfo();
  const nodeName = NAME ? `${NAME}-${ISP}` : ISP;
  return new Promise((resolve) => {
    setTimeout(() => {
      const VMESS = { v: '2', ps: `${nodeName}`, add: CFIP, port: CFPORT, id: UUID, aid: '0', scy: 'none', net: 'ws', type: 'none', host: argoDomain, path: '/vmess-argo?ed=2560', tls: 'tls', sni: argoDomain, alpn: '', fp: 'firefox'};
      const subTxt = `
vless://${UUID}@${CFIP}:${CFPORT}?encryption=none&security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Fvless-argo%3Fed%3D2560#${nodeName}

vmess://${Buffer.from(JSON.stringify(VMESS)).toString('base64')}

trojan://${UUID}@${CFIP}:${CFPORT}?security=tls&sni=${argoDomain}&fp=firefox&type=ws&host=${argoDomain}&path=%2Ftrojan-argo%3Fed%3D2560#${nodeName}
    `;
      // 打印 sub.txt 内容到控制台
      console.log(Buffer.from(subTxt).toString('base64'));
      fs.writeFileSync(subPath, Buffer.from(subTxt).toString('base64'));
      console.log(`${FILE_PATH}/sub.txt saved successfully`);
      uploadNodes();
      // 将内容进行 base64 编码并写入 SUB_PATH 路由
      app.get(`/${SUB_PATH}`, (req, res) => {
        const encodedContent = Buffer.from(subTxt).toString('base64');
        res.set('Content-Type', 'text/plain; charset=utf-8');
        res.send(encodedContent);
      });
      resolve(subTxt);
      }, 2000);
    });
  }
}

// 自动上传节点或订阅
async function uploadNodes() {
  if (UPLOAD_URL && PROJECT_URL) {
    const subscriptionUrl = `${PROJECT_URL}/${SUB_PATH}`;
    const jsonData = {
      subscription: [subscriptionUrl]
    };
    try {
        const response = await axios.post(`${UPLOAD_URL}/api/add-subscriptions`, jsonData, {
            headers: {
                'Content-Type': 'application/json'
            }
        });

        if (response && response.status === 200) {
            console.log('Subscription uploaded successfully');
            return response;
        } else {
          return null;
          //  console.log('Unknown response status');
        }
    } catch (error) {
        if (error.response) {
            if (error.response.status === 400) {
              //  console.error('Subscription already exists');
            }
        }
    }
  } else if (UPLOAD_URL) {
      if (!fs.existsSync(listPath)) return;
      const content = fs.readFileSync(listPath, 'utf-8');
      const nodes = content.split('\n').filter(line => /(vless|vmess|trojan|hysteria2|tuic):\/\//.test(line));

      if (nodes.length === 0) return;

      const jsonData = JSON.stringify({ nodes });

      try {
          const response = await axios.post(`${UPLOAD_URL}/api/add-nodes`, jsonData, {
              headers: { 'Content-Type': 'application/json' }
          });
          if (response && response.status === 200) {
            console.log('Nodes uploaded successfully');
            return response;
        } else {
            return null;
        }
      } catch (error) {
          return null;
      }
  } else {
      // console.log('Skipping upload nodes');
      return;
  }
}

// 90s后删除相关文件
function cleanFiles() {
  setTimeout(() => {
    const filesToDelete = [bootLogPath, configPath, webPath, botPath];

    if (NEZHA_PORT) {
      filesToDelete.push(npmPath);
    } else if (NEZHA_SERVER && NEZHA_KEY) {
      filesToDelete.push(phpPath);
    }

    // Windows系统使用不同的删除命令
    if (process.platform === 'win32') {
      exec(`del /f /q ${filesToDelete.join(' ')} > nul 2>&1`, (error) => {
        console.clear();
        console.log('App is running');
        console.log('Thank you for using this script, enjoy!');
      });
    } else {
      exec(`rm -rf ${filesToDelete.join(' ')} >/dev/null 2>&1`, (error) => {
        console.clear();
        console.log('App is running');
        console.log('Thank you for using this script, enjoy!');
      });
    }
  }, 90000); // 90s
}
cleanFiles();

// 自动访问项目URL
async function AddVisitTask() {
  if (!AUTO_ACCESS || !PROJECT_URL) {
    console.log("Skipping adding automatic access task");
    return;
  }

  try {
    const response = await axios.post('https://oooo.serv00.net/add-url', {
      url: PROJECT_URL
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });
    // console.log(`${JSON.stringify(response.data)}`);
    console.log(`automatic access task added successfully`);
    return response;
  } catch (error) {
    console.error(`Add automatic access task faild: ${error.message}`);
    return null;
  }
}

// 主运行逻辑
async function startserver() {
  try {
    argoType();
    deleteNodes();
    cleanupOldFiles();
    await generateConfig();
    await downloadFilesAndRun();
    await extractDomains();
    await AddVisitTask();
  } catch (error) {
    console.error('Error in startserver:', error);
  }
}
startserver().catch(error => {
  console.error('Unhandled error in startserver:', error);
});
app.listen(PORT, () => console.log(`http server is running on port:${PORT}!`));
