# Desktop-File-Manager (Web First Skeleton)

网页端已升级为 React + 路由 + 历史会话界面，包含：

- 顶部智能体查询卡片（问“有没有存过/哪天发过/文件说了什么”）
- 中部聊天历史时间轴（微信风格右侧消息气泡）
- 底部专用存储区（发送文字、自动识别链接、上传文件）
- 历史查询页（日期/文件/链接/关键词）
- 单智能体 + 本地RAG（文本、链接、文件内容入库）

## 架构说明

- 前后端分离开发
- 后端仅提供 API，不托管前端页面
- 前端独立运行在 Vite 开发服务器

## 目录

- `backend/app/main.py`: API 入口
- `backend/app/db.py`: SQLite 建表与连接
- `backend/app/routers/`: 业务路由
- `backend/app/services/llm_service.py`: 大模型调用
- `backend/app/services/rag_service.py`: RAG 入库/检索
- `frontend/src/`: React 前端源码

## 智能体环境变量

在 `backend` 目录新建 `.env`（可参考 `backend/.env.example`），支持：

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL_ID`
- `LLM_TEMPERATURE`
- `LLM_MAX_TOKENS`
- `LLM_TIMEOUT_SECONDS`

示例：

```env
LLM_BASE_URL=https://aihubmix.com/v1
LLM_API_KEY=your_api_key_here
LLM_MODEL_ID=coding-glm-5.1
LLM_TEMPERATURE=0.2
LLM_MAX_TOKENS=4096
LLM_TIMEOUT_SECONDS=120
```

说明：如果 `LLM_API_KEY` 为空，`/agent/ask` 会自动回退到本地摘要模式。

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

- `POST /messages/upload`
- `POST /messages`
- `GET /messages`
- `POST /messages/attachments/{attachment_id}/show-in-folder`
- `DELETE /messages/{message_id}`
- `POST /search`
- `POST /rag/ocr-ingest`
- `POST /rag/ingest`
- `POST /rag/ingest-message`
- `POST /agent/ask`
