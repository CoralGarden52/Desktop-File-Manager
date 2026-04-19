from typing import Optional

from pydantic import BaseModel, Field


class MessageCreate(BaseModel):
    msg_type: str = Field(default="text")
    text: Optional[str] = None
    created_at: Optional[str] = None


class AttachmentCreate(BaseModel):
    file_name: str
    mime_type: Optional[str] = None
    size_bytes: Optional[int] = None
    storage_key: Optional[str] = None
    sha256: Optional[str] = None


class LinkCreate(BaseModel):
    url: str
    domain: Optional[str] = None
    title: Optional[str] = None


class MessageBundleCreate(BaseModel):
    message: MessageCreate
    attachment: Optional[AttachmentCreate] = None
    link: Optional[LinkCreate] = None


class SearchQuery(BaseModel):
    keyword: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    date_exact: Optional[str] = None
    file_name: Optional[str] = None
    link_domain: Optional[str] = None
    content_type: Optional[str] = None  # file | image_video | link | date


class OcrIngestRequest(BaseModel):
    attachment_id: int
    ocr_text: str
    confidence: Optional[float] = None


class RagIngestRequest(BaseModel):
    message_id: int
    source_type: str = Field(default="text")
    chunk_text: str


class AgentAskRequest(BaseModel):
    question: str


class AgentAskResponse(BaseModel):
    answer: str
    matched_dates: list[str]
    evidence: list[str]
