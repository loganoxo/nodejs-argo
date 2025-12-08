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
const NEZHA_SERVER = process.env.NEZHA_SERVER || '';        // 哪吒v1填写形式: nz.abc.com:8008  哪吒v0填写形式：nz.abc.com
const NEZHA_PORT = process.env.NEZHA_PORT || '';            // 使用哪吒v1请留空，哪吒v0需填写
const NEZHA_KEY = process.env.NEZHA_KEY || '';              // 哪吒v1的NZ_CLIENT_SECRET或哪吒v0的agent密钥
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
<!DOCTYPE html>
<html lang="zh">
<head>
<meta charset="UTF-8">
<title>Ray的总结</title>
<style>
* {
  box-sizing: border-box;
  margin: 0;
  padding: 0;
}
body {
  font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
  background: #e9eff1;
  color: #444;
}
header {
  background: #fafafa;
  padding: 25px 60px;
  box-shadow: 0 3px 7px rgba(0,0,0,0.15);
  position: sticky;
  top: 0;
  z-index: 100;
}
header h1 {
  font-size: 2.2em;
  color: #444;
  font-weight: bold;
}
nav {
  margin-top: 10px;
}
nav a {
  text-decoration: none;
  color: #1e73b5;
  margin-right: 25px;
  font-size: 1em;
}
nav a:hover {
  color: #d95f5f;
  text-decoration: underline;
}
.container {
  display: flex;
  max-width: 1200px;
  margin: 50px auto;
  gap: 40px;
  padding: 0 30px;
}
main {
  flex: 3;
  display: flex;
  flex-direction: column;
  gap: 30px;
}
article {
  background: #fff;
  padding: 30px 35px;
  border-radius: 12px;
  box-shadow: 0 3px 10px rgba(0,0,0,0.1);
  transition: transform 0.3s, box-shadow 0.3s;
}
article:hover {
  transform: translateY(-5px);
  box-shadow: 0 5px 15px rgba(0,0,0,0.15);
}
article h2 {
  color: #333;
  margin-bottom: 15px;
  font-size: 1.8em;
  font-weight: 600;
}
article p {
  line-height: 1.75;
  margin-bottom: 18px;
}
article a {
  color: #1e73b5;
  text-decoration: none;
  font-weight: bold;
}
article a:hover {
  color: #d95f5f;
  text-decoration: underline;
}
aside {
  flex: 1;
  background: #fff;
  padding: 25px;
  border-radius: 12px;
  height: fit-content;
  box-shadow: 0 3px 10px rgba(0,0,0,0.1);
}
aside h3 {
  margin-bottom: 20px;
  color: #444;
  font-size: 1.3em;
  font-weight: 600;
  border-bottom: 2px solid #ddd;
  padding-bottom: 10px;
}
aside ul {
  list-style: none;
}
aside li {
  margin-bottom: 12px;
}
aside a {
  color: #1e73b5;
  text-decoration: none;
}
aside a:hover {
  color: #d95f5f;
  text-decoration: underline;
}
footer {
  text-align: center;
  color: #888;
  font-size: 1em;
  padding: 30px 0;
  margin-top: 60px;
}
</style>
</head>
<body>
<header>
<h1>Ray的总结</h1>
<nav>
<a href="#">HOME</a>
<a href="#">探险</a>
<a href="#">娱乐</a>
<a href="#">编程</a>
<a href="#">我们</a>
<a href="#">照片</a>
<a href="#">吃喝</a>
</nav>
</header>
<div class="container">
<main>
<article>
<h2>探索人工智能的未来</h2>
<p>人工智能正迅速改变着我们的世界，从自动驾驶到智能家居，各种创新应用层出不穷。未来的人工智能将不仅仅是技术，它将成为我们日常生活的一部分，提升生产力并解决许多挑战。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>如何提升前端性能</h2>
<p>前端性能直接影响用户体验，页面加载速度和响应时间是至关重要的因素。通过优化图片、懒加载、减少HTTP请求和使用CDN等方法，可以显著提高前端性能。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>区块链技术的应用前景</h2>
<p>区块链技术在金融行业的应用最为广泛，但其去中心化和不可篡改的特点使得它在供应链管理、医疗健康和数据存储等领域也展现出巨大的潜力。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>Web开发中的安全性考虑</h2>
<p>随着互联网应用的普及，Web安全问题越来越受到关注。通过采取如HTTPS加密、输入验证、防止SQL注入等手段，可以有效防止各种网络攻击。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>深入了解机器学习算法</h2>
<p>机器学习是人工智能的核心，其通过从数据中学习模式来做出预测。常见的机器学习算法包括决策树、支持向量机和神经网络等。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>JavaScript异步编程详解</h2>
<p>JavaScript的异步编程可以让程序在等待某些操作时不阻塞主线程，常用的异步编程方法包括回调函数、Promise和async/await等。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>如何优化数据库查询</h2>
<p>数据库查询的效率直接影响系统的响应速度。使用索引、避免不必要的联接以及优化SQL语句是提高数据库查询性能的常见方法。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>深入浅出React Hooks</h2>
<p>React Hooks是React 16.8引入的新特性，它允许在函数组件中使用状态和副作用，而无需编写类组件。常见的Hooks包括useState、useEffect和useContext等。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>为什么要使用Docker</h2>
<p>Docker提供了一种轻量级的虚拟化技术，可以在任何环境中快速部署应用程序。通过容器化技术，开发人员可以保证应用程序在不同平台上运行的一致性。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>Vue.js与React.js的对比</h2>
<p>Vue.js和React.js是目前最受欢迎的前端框架，它们各自有其优势和适用场景。Vue.js适合快速开发和灵活的架构，而React.js则在大型项目中具有更好的扩展性。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>如何进行代码重构</h2>
<p>代码重构是指对现有代码进行修改，以提高代码的可读性、可维护性和性能。常见的重构方法包括提取函数、删除重复代码和优化算法等。</p>
<a href="#">查看 →</a>
</article>
<article>
<h2>浅谈敏捷开发</h2>
<p>敏捷开发是一种快速响应变化、迭代式开发的软件开发方法。通过小的迭代周期和持续的用户反馈，敏捷开发能够快速适应市场需求的变化。</p>
<a href="#">查看 →</a>
</article>
</main>
<aside>
<h3>推荐阅读</h3>
<ul>
<li><a href="#">如何提升生活质量</a></li>
<li><a href="#">健康的咖啡饮用习惯</a></li>
<li><a href="#">未来科技与人工智能</a></li>
<li><a href="#">不一样的节庆美食</a></li>
<li><a href="#">浅谈敏捷开发</a></li>
<li><a href="#">如何进行代码重构</a></li>
<li><a href="#">Vue.js与React.js的对比</a></li>
<li><a href="#">为什么要使用Docker</a></li>
</ul>
<h3>筛选</h3>
<ul>
<li><a href="#">Vue</a></li>
<li><a href="#">Docker</a></li>
<li><a href="#">开发</a></li>
<li><a href="#">代码</a></li>
<li><a href="#">算法</a></li>
<li><a href="#">AI</a></li>
</ul>
<h3>兴趣</h3>
<ul>
<li><a href="#">科幻小说</a></li>
<li><a href="#">摄影艺术</a></li>
<li><a href="#">水下探险</a></li>
<li><a href="#">传统手工艺</a></li>
<li><a href="#">宇宙探索</a></li>
<li><a href="#">极限烹饪</a></li>
<li><a href="#">现代舞蹈</a></li>
<li><a href="#">数字艺术</a></li>
</ul>
</aside>
</div>
<footer>© 2025 Ray的总结</footer>
</body>
</html>
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
