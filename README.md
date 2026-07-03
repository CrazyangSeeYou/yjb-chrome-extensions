# 养鸡宝 Chrome 插件
（养基宝官网下载的插件AI魔改，解决官方的插件不实时刷新收益率/收益的问题，侵删）

使用了 公开基金估值接口： 天天基金估值 东方财富基金接口

这是一个 Chrome MV3 插件，用于通过养鸡宝的微信扫码入口登录账号，并在浏览器弹窗中查看基金持仓、指数行情、实时估值、当日收益和角标收益提醒。

注意：本插件只有养鸡宝的微信扫码登录入口，没有支付宝、天天基金、腾讯理财通、蛋卷基金等平台的扫码登录入口。代码中出现这些平台名称，是用于展示账户来源或导入说明，不代表存在对应平台的扫码登录接口。

## 功能概览

- 微信扫码登录养鸡宝账号。
- 同步账号列表、基金持仓、账户汇总和收益曲线。
- 展示上证指数、深证成指、创业板指、沪深 300、上证 50 等指数行情。
- 根据持仓和公开估值接口计算当日收益。
- 支持浏览器角标显示当日收益或收益率。
- 支持基金搜索、添加持仓、删除持仓。

## 截图

### 持仓首页与导入入口

![持仓首页与导入入口](yjb-plugins/Image/1.png)

### 微信扫码登录

![微信扫码登录](yjb-plugins/Image/2.png)

### 基金持仓与收益展示

![基金持仓与收益展示](yjb-plugins/Image/3.png)

## 登录与数据流程

1. 弹窗点击登录后，请求养鸡宝后端生成微信登录二维码。
2. 用户使用微信扫码。
3. 插件轮询二维码状态接口。
4. 登录成功后，后端返回 `token`、头像和昵称。
5. 插件使用该 `token` 请求账号列表、基金持仓、收益数据等接口。
6. 持仓数据会结合公开基金估值接口补充实时估值，再计算界面和角标收益。


### 公开基金估值接口

| 来源 | 方法 | 地址 | 用途 |
| --- | --- | --- | --- |
| 天天基金估值 | GET | `https://fundgz.1234567.com.cn/js/{code}.js?rt={timestamp}` | 优先获取基金实时估值 |
| 东方财富基金接口 | GET | `https://fundmobapi.eastmoney.com/FundMNewApi/FundMNFInfo?...&Fcodes={codes}` | 批量补充缺失估值和净值 |

### 插件权限对应的域名

`manifest.json` 中声明了这些访问域名：

```text
http://192.168.101.181:8010/yjb_plugin/*
http://yjbplugin-test.52guihua.cn/*
http://browser-plug-api.yangjibao.com/*
https://fundgz.1234567.com.cn/*
https://fundmobapi.eastmoney.com/*
```

其中 `browser-plug-api.yangjibao.com` 是正式后端接口；`fundgz.1234567.com.cn` 和 `fundmobapi.eastmoney.com` 用于基金估值补充。

## 关于第三方平台名称

界面文案中出现“支付宝 / 天天基金 / 腾讯理财通 / 蛋卷基金”，含义是插件可展示或导入这些来源的基金持仓数据。它们不是扫码登录入口，代码里也没有对应这些平台的扫码登录接口。

当前扫码相关接口只有：

```text
GET /qr_code
GET /qr_code_state/{qrId}
```

这两个接口用于养鸡宝账号的微信扫码登录。

## 安装方式

1. 打开 Chrome，进入 `chrome://extensions`。
2. 打开右上角“开发者模式”。
3. 点击“加载已解压的扩展程序”。
4. 选择本项目目录。
5. 点击浏览器工具栏中的插件图标使用。

## 项目结构

```text
.
├── assets/             # 插件图标与静态资源
├── css/                # 样式文件
├── Image/              # README 截图
├── js/                 # 前端弹窗与后台打包脚本
├── manifest.json       # Chrome 扩展配置
├── popup.html          # 插件弹窗入口
└── service-worker.js   # MV3 后台 Service Worker
```

## 调试说明

修改代码后，需要在 `chrome://extensions` 中重新加载插件。由于这是 Chrome MV3 插件，后台逻辑运行在 Service Worker 中，浏览器可能会缓存旧的后台脚本，重新加载后才能确保新代码生效。

常用检查命令：

```bash
node --check js/popup.js
node --check js/background.js
node --check service-worker.js
```
