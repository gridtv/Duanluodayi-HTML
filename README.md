# 段落大意之凝聚 - 网页版

文本/文件/图片智能摘要工具，基于通义千问 qwen3.5-plus 模型。

## 分支说明
- **main** — 网页版（当前）
- **miniprogram-backup** — 微信小程序版（备份）

## 目录结构
- `server.js` — Express 后端入口
- `public/` — 前端页面（index.html）
- `package.json` — 依赖配置

## API 接口
- `POST /api/summarize` — 文本摘要
- `POST /api/summarize-file` — 文件摘要
- `POST /api/summarize-image` — 图片摘要

## 环境变量
- `DASHSCOPE_API_KEY` — 通义千问 API Key

## 运行
npm install
node server.js
服务默认监听 3001 端口。
