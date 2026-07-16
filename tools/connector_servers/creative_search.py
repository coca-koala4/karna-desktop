"""creative_search — 创作搜索 MCP Server (4 tools)。

跨连接器聚合搜索。
"""

from __future__ import annotations

import json

from .base import BuiltinMCPServer, run_server


class CreativeSearchServer(BuiltinMCPServer):
    server_name = "creative_search"
    server_version = "0.1.0"

    tools = [
        {
            "name": "unified_search",
            "description": "统一搜索（跨所有连接器数据）",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "limit": {"type": "string", "description": "返回结果数量上限（默认20）"},
                },
                "required": ["query"],
            },
        },
        {
            "name": "search_by_type",
            "description": "按类型搜索（character/plot/scene/article/persona）",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                    "type": {
                        "type": "string",
                        "enum": ["character", "plot", "scene", "article", "persona"],
                        "description": "数据类型",
                    },
                },
                "required": ["query", "type"],
            },
        },
        {
            "name": "search_by_tags",
            "description": "按标签搜索",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "tags": {"type": "string", "description": "标签，逗号分隔"},
                },
                "required": ["tags"],
            },
        },
        {
            "name": "get_trending_tags",
            "description": "获取热门标签",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
    ]

    def __init__(self, connector_id: str = "creative_search"):
        super().__init__(connector_id)

    def _read_connector_data(self, connector_id: str, filename: str):
        """读取其他连接器的数据文件。"""
        base = self.data_dir.parent / connector_id
        path = base / filename
        if path.exists():
            return json.loads(path.read_text(encoding="utf-8"))
        return []

    def _search_items(self, items: list, query: str, fields: list[str]) -> list[dict]:
        """在 items 中搜索，匹配指定字段。"""
        results = []
        q = query.lower()
        for item in items:
            haystack = " ".join(str(item.get(f, "")) for f in fields).lower()
            if q in haystack:
                results.append(item)
        return results

    async def handle_unified_search(self, args):
        query = args.get("query", "").strip()
        if not query:
            return {"error": "搜索关键词不能为空"}
        try:
            limit = int(args.get("limit", 20))
        except (ValueError, TypeError):
            limit = 20

        all_results = []

        # 搜索角色
        characters = self._read_connector_data("story_bible", "characters.json")
        for c in self._search_items(characters, query, ["name", "role", "personality", "background", "motivation"]):
            all_results.append({"type": "character", "id": c["id"], "title": c.get("name", ""), "snippet": c.get("personality", "")[:100]})

        # 搜索情节
        plots = self._read_connector_data("story_bible", "plots.json")
        for p in self._search_items(plots, query, ["title", "summary"]):
            all_results.append({"type": "plot", "id": p["id"], "title": p.get("title", ""), "snippet": p.get("summary", "")[:100]})

        # 搜索场景
        scenes = self._read_connector_data("narrative_state", "scenes.json")
        for s in self._search_items(scenes, query, ["title", "summary", "location", "mood"]):
            all_results.append({"type": "scene", "id": s["id"], "title": s.get("title", ""), "snippet": s.get("summary", "")[:100]})

        # 搜索百科
        articles = self._read_connector_data("living_wiki", "articles.json")
        for a in self._search_items(articles, query, ["title", "content", "category"]):
            content = a.get("content", "")
            idx = content.lower().find(query.lower())
            snippet = ""
            if idx >= 0:
                start = max(0, idx - 30)
                end = min(len(content), idx + len(query) + 30)
                snippet = f"...{content[start:end]}..."
            all_results.append({"type": "article", "id": a["id"], "title": a.get("title", ""), "snippet": snippet[:100]})

        # 搜索人格
        personas = self._read_connector_data("soul_workshop", "personas.json")
        for p in self._search_items(personas, query, ["name", "description", "traits"]):
            all_results.append({"type": "persona", "id": p["id"], "title": p.get("name", ""), "snippet": p.get("description", "")[:100]})

        return {"query": query, "total": len(all_results[:limit]), "results": all_results[:limit]}

    async def handle_search_by_type(self, args):
        query = args.get("query", "").strip()
        dtype = args.get("type", "").strip()
        if not query:
            return {"error": "搜索关键词不能为空"}
        if not dtype:
            return {"error": "类型不能为空"}

        type_config = {
            "character": ("story_bible", "characters.json", ["name", "role", "personality", "background"]),
            "plot": ("story_bible", "plots.json", ["title", "summary"]),
            "scene": ("narrative_state", "scenes.json", ["title", "summary", "location", "mood"]),
            "article": ("living_wiki", "articles.json", ["title", "content"]),
            "persona": ("soul_workshop", "personas.json", ["name", "description", "traits"]),
        }
        config = type_config.get(dtype)
        if not config:
            return {"error": f"未知类型: {dtype}"}

        connector_id, filename, fields = config
        items = self._read_connector_data(connector_id, filename)
        matched = self._search_items(items, query, fields)
        return {"type": dtype, "query": query, "matches": len(matched), "results": matched[:20]}

    async def handle_search_by_tags(self, args):
        tags_raw = args.get("tags", "").strip()
        if not tags_raw:
            return {"error": "标签不能为空"}
        search_tags = [t.strip().lower() for t in tags_raw.split(",") if t.strip()]
        results = []

        # 搜索百科文章
        articles = self._read_connector_data("living_wiki", "articles.json")
        for a in articles:
            article_tags = [t.lower() for t in a.get("tags", [])]
            if any(st in article_tags for st in search_tags):
                results.append({"type": "article", "id": a["id"], "title": a.get("title", ""), "tags": a.get("tags", [])})

        # 搜索人格
        personas = self._read_connector_data("soul_workshop", "personas.json")
        for p in personas:
            persona_tags = [t.lower() for t in p.get("tags", [])]
            if any(st in persona_tags for st in search_tags):
                results.append({"type": "persona", "id": p["id"], "title": p.get("name", ""), "tags": p.get("tags", [])})

        return {"tags": search_tags, "matches": len(results), "results": results}

    async def handle_get_trending_tags(self, args):
        tag_counts: dict[str, int] = {}

        # 从百科收集
        articles = self._read_connector_data("living_wiki", "articles.json")
        for a in articles:
            for t in a.get("tags", []):
                tag_counts[t] = tag_counts.get(t, 0) + 1

        # 从人格收集
        personas = self._read_connector_data("soul_workshop", "personas.json")
        for p in personas:
            for t in p.get("tags", []):
                tag_counts[t] = tag_counts.get(t, 0) + 1

        # 排序
        sorted_tags = sorted(tag_counts.items(), key=lambda x: x[1], reverse=True)
        return {"trending_tags": [{"tag": t, "count": c} for t, c in sorted_tags[:20]]}


if __name__ == "__main__":
    run_server(CreativeSearchServer("creative_search"))
