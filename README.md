# Desktop File Manager

一个面向个人桌面场景的“类微信文件传输助手 + Agent + RAG”项目。  
核心目标是解决个人文件与聊天内容“难沉淀、难检索、难提问、难复用”的问题，把日常消息与文件中转能力扩展为可理解、可追问、可溯源的本地智能知识助手。

## 项目价值

1. 文件与消息统一沉淀  
支持文本、链接、附件统一入库，避免内容散落在聊天记录和本地目录中。

2. 多维可检索  
支持按关键词、日期、文件名、链接等维度检索历史内容，不再依赖手工翻找。

3. 文件内容可理解  
上传文件后进行内容提取与 RAG 分块（如 `txt/docx`），让问答可以基于“文件正文”而不仅是文件名。

4. 引用式提问闭环  
支持先引用消息/文件，再提问；系统会将“用户问题 + 引用文件上下文”交给智能体生成回答。

5. 抽屉式智能体会话  
支持独立会话、连续追问、证据展示与原消息跳转，形成完整问答链路。

6. 证据化输出  
回答附带命中日期、证据片段和来源定位，结果更可验证、可追踪。

## 功能概览

- 顶部查询区：引用内容后提问，触发智能体问答
- 中部时间轴：微信风格消息展示，支持右键引用与删除
- 底部存储区：发送文本、自动识别链接、上传文件
- 历史查询页：按日期/文件/链接/关键词过滤与回看
- 智能体抽屉：会话管理、证据链展示、消息定位

## 技术架构

- 前端：`React + Vite`
- 后端：`FastAPI`
- 存储：`SQLite`
- 检索与问答：`RAG + LLM API`
- 文件处理：`TXT/DOCX` 内容提取、分块入库

## 目录结构

- `backend/app/main.py`：API 入口
- `backend/app/db.py`：SQLite 初始化与连接
- `backend/app/routers/`：消息、检索、RAG、Agent 路由
- `backend/app/services/rag_service.py`：RAG 入库、检索、文件上下文召回
- `backend/app/services/llm_service.py`：LLM 调用封装
- `frontend/src/`：前端页面与组件

## 环境变量

在 `backend/.env` 中配置（参考 `backend/.env example`）：

- `LLM_BASE_URL`
- `LLM_API_KEY`
- `LLM_MODEL_ID`
- `LLM_TEMPERATURE`
- `LLM_MAX_TOKENS`
- `LLM_TIMEOUT_SECONDS`

说明：未配置 `LLM_API_KEY` 时，智能体会走本地回退回答逻辑。

## 本地运行

1. 启动后端

```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

2. 启动前端

```bash
cd frontend
npm install
npm run dev
```

3. 访问页面

- 前端：`http://127.0.0.1:5173`
- 后端：`http://127.0.0.1:8000`

## 主要接口

- `POST /messages/upload`：上传附件
- `POST /messages`：创建消息（可带附件/链接）
- `GET /messages`：分页读取消息
- `DELETE /messages/{message_id}`：删除消息及关联内容
- `POST /messages/attachments/{attachment_id}/show-in-folder`：定位附件文件夹
- `POST /search`：历史检索
- `POST /rag/ocr-ingest`：OCR 内容入库
- `POST /rag/ingest`：通用 RAG 入库
- `POST /rag/ingest-message`：消息级 RAG 入库
- `POST /agent/ask`：智能体问答（支持引用文件提问）
