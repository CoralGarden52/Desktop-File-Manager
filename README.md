# Desktop-File-Manager (Web First Skeleton)

网页端已升级为 React + 路由 + 历史会话界面，包含：

- 顶部智能体查询卡片（问“有没有存过/哪天发过/文件说了什么”）
- 中部聊天历史时间轴（微信风格右侧消息气泡）
- 底部专用存储区（发送文字、链接、图片/文件元数据）
- 历史查询页（日期/文件/链接/关键词）

## 架构说明

- 前后端分离开发
- 后端仅提供 API，不托管前端页面
- 前端独立运行在 Vite 开发服务器

## 目录

- `backend/app/main.py`: API 入口
- `backend/app/db.py`: SQLite 建表与连接
- `backend/app/routers/`: 业务路由
- `frontend/src/`: React 前端源码

## 本地启动

1. 启动后端 API

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

2. 启动前端（React + Vite）

```bash
cd frontend
npm install
npm run dev
```

3. 打开前端页面

访问：`http://127.0.0.1:5173`

说明：前端默认请求 `http://127.0.0.1:8000`，已允许跨域。

## 接口

- `POST /messages`
- `GET /messages`
- `POST /search`
- `POST /rag/ocr-ingest`
- `POST /rag/ingest`
- `POST /agent/ask`

## 下一步建议

1. 将 `crypto_service.py` 替换为 Argon2id + AES-GCM 真加密。
2. 增加真实文件上传落盘与 `storage_key` 管理。
3. 接入 OCR 引擎并自动将图片文本写入 `rag_chunks`。
4. 给 `rag_chunks` 增加 embedding 与向量检索。
