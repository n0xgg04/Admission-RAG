from __future__ import annotations

import httpx

from app.core.config import settings


class OpenRouterService:
    def __init__(self) -> None:
        self.base_url = settings.openrouter_base_url.rstrip("/")

    def _build_messages(
        self,
        query: str,
        context_blocks: list[str],
        recent_user_queries: list[str] | None = None,
        fallback_hint: str | None = None,
    ) -> list[dict[str, str]]:
        context = "\n\n".join(context_blocks)
        system_prompt = """
Bạn là trợ lý tư vấn tuyển sinh đại học cho học sinh/phụ huynh.

MỤC TIÊU
- Trả lời chính xác, dễ hiểu, thực tế cho người dùng cuối.
- Chỉ dùng thông tin có trong CONTEXT truy xuất nội bộ.

RÀNG BUỘC BẮT BUỘC
1) KHÔNG bịa dữ liệu, KHÔNG suy đoán, KHÔNG tự điền số liệu thiếu.
2) Nếu context không đủ:
   - Dùng cách nói thân thiện, tránh thuật ngữ kỹ thuật như "crawl", "chunk", "metadata", "context".
   - Ưu tiên mẫu câu: "Hiện mình chưa có đủ thông tin để trả lời chính xác".
   - Nêu ngắn gọn đang thiếu thông tin gì (ví dụ: thiếu điểm chuẩn/thiếu tổ hợp/thiếu phương thức).
   - Gợi ý người dùng nêu rõ trường/ngành/phương thức để kiểm tra chính xác hơn.
3) Dữ liệu chỉ áp dụng cho mùa tuyển sinh 2025:
   - Nếu người dùng hỏi năm khác, nhắc ngắn gọn phạm vi 2025.
   - Không suy diễn, không so sánh sang năm khác nếu context không có.
4) Không hiển thị hoặc viện dẫn URL nguồn thô (source_url, pdf_url).

PHONG CÁCH TRẢ LỜI
- Viết tiếng Việt tự nhiên, lịch sự, rõ ràng.
- Ưu tiên trả lời trực tiếp ý chính trước, sau đó mới thêm chi tiết ngắn.
- Ngắn gọn vừa đủ, tránh lan man kỹ thuật.
- Khi có nhiều ý, trình bày theo bullet để dễ đọc.
- Không dùng các cụm mang tính hệ thống nội bộ như "bộ crawl", "context truy xuất", "vector".

ƯU TIÊN NỘI DUNG
- Câu hỏi về điểm chuẩn: ưu tiên số liệu điểm chuẩn có cấu trúc trong context; nếu thiếu thì báo thiếu.
- Câu hỏi về ngành/phương thức: ưu tiên thông tin ngành, điều kiện, quy chế, tổ hợp có trong context.
- Câu hỏi về học phí/thời gian: chỉ nêu đúng phần có trong context.
        """.strip()
        memory_block = ""
        if recent_user_queries:
            rows = "\n".join(
                [f"- {item.strip()}" for item in recent_user_queries if item and item.strip()]
            )
            if rows:
                memory_block = (
                    "\n\nNgữ cảnh hội thoại gần đây (5 câu hỏi trước của người dùng, dùng để hiểu ý định):\n"
                    f"{rows}"
                )
        hint_block = f"\n\nGợi ý fallback: {fallback_hint}" if fallback_hint else ""
        user_prompt = (
            f"Câu hỏi người dùng: {query}\n\n"
            "Context truy xuất:\n"
            f"{context}\n\n"
            f"Yêu cầu: trả lời đúng trong phạm vi dữ liệu, ưu tiên dễ hiểu cho người dùng cuối."
            f"{memory_block}{hint_block}"
        )
        return [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def generate(
        self,
        query: str,
        context_blocks: list[str],
        recent_user_queries: list[str] | None = None,
        fallback_hint: str | None = None,
    ) -> str:
        if not settings.openrouter_api_key:
            raise RuntimeError("OPENROUTER_API_KEY is missing")

        payload = {
            "model": settings.openrouter_model,
            "messages": self._build_messages(
                query=query,
                context_blocks=context_blocks,
                recent_user_queries=recent_user_queries,
                fallback_hint=fallback_hint,
            ),
            "temperature": 0.1,
        }
        headers = {
            "Authorization": f"Bearer {settings.openrouter_api_key}",
            "Content-Type": "application/json",
        }

        with httpx.Client(timeout=60.0) as client:
            response = client.post(
                f"{self.base_url}/chat/completions", json=payload, headers=headers
            )
            response.raise_for_status()
            data = response.json()

        choices = data.get("choices") or []
        if not choices:
            raise RuntimeError("OpenRouter returned empty choices")

        message = choices[0].get("message") or {}
        content = message.get("content")
        if not content:
            raise RuntimeError("OpenRouter returned empty content")
        return str(content).strip()


openrouter_service = OpenRouterService()
