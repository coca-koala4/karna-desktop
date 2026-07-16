"""living_wiki — 活百科 MCP Server (6 tools)。

维护项目百科文章，支持搜索与关联。
"""

from __future__ import annotations

from .base import BuiltinMCPServer, run_server


class LivingWikiServer(BuiltinMCPServer):
    server_name = "living_wiki"
    server_version = "0.1.0"

    tools = [
        {
            "name": "list_articles",
            "description": "列出所有百科文章",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "category": {"type": "string", "description": "按分类筛选（可选）"},
                },
                "required": [],
            },
        },
        {
            "name": "create_article",
            "description": "创建新百科文章",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "文章标题"},
                    "category": {"type": "string", "description": "分类（世界观/人物/设定/物品等）"},
                    "content": {"type": "string", "description": "文章内容（Markdown）"},
                    "tags": {"type": "string", "description": "标签，逗号分隔"},
                },
                "required": ["title", "content"],
            },
        },
        {
            "name": "update_article",
            "description": "更新百科文章",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "article_id": {"type": "string", "description": "文章ID"},
                    "title": {"type": "string"},
                    "content": {"type": "string"},
                    "category": {"type": "string"},
                    "tags": {"type": "string"},
                },
                "required": ["article_id"],
            },
        },
        {
            "name": "delete_article",
            "description": "删除百科文章",
            "inputSchema": {
                "type": "object",
                "properties": {"article_id": {"type": "string", "description": "文章ID"}},
                "required": ["article_id"],
            },
        },
        {
            "name": "search_articles",
            "description": "搜索百科文章",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "query": {"type": "string", "description": "搜索关键词"},
                },
                "required": ["query"],
            },
        },
        {
            "name": "get_article_links",
            "description": "获取文章之间的关联（双链）",
            "inputSchema": {
                "type": "object",
                "properties": {"article_id": {"type": "string", "description": "文章ID"}},
                "required": ["article_id"],
            },
        },
    ]

    def __init__(self, connector_id: str = "living_wiki"):
        super().__init__(connector_id)
        self._init_sample_data()

    def _init_sample_data(self):
        """预置示例百科文章。"""
        articles = self._load_json("articles.json")
        if not articles:
            articles.extend([
                {
                    "id": "wiki_001",
                    "title": "世界观设定",
                    "category": "世界观",
                    "content": "# 世界观设定\n\n## 时代背景\n故事发生在当代中国，一个快速发展的二线城市。\n\n## 社会环境\n- 城市化进程中的新旧碰撞\n- 传统价值观与现代思潮的冲突\n- 文学圈的边缘化与自我救赎\n\n## 关键地点\n- 火车站：林晓风抵达的起点\n- 旧城区书店：相遇的场所\n- 老陈的公寓：精神殿堂",
                    "tags": ["世界观", "背景", "设定"],
                    "links": ["wiki_002", "wiki_003"],
                    "created_at": self._now(),
                    "updated_at": self._now(),
                },
                {
                    "id": "wiki_002",
                    "title": "魔法体系",
                    "category": "设定",
                    "content": "# 文学的力量\n\n在这个故事中，「魔法」是隐喻——指文学创作对人内心的 transformative power。\n\n## 核心概念\n- **文字共鸣**：好的文字能引发读者深层情感共振\n- **故事治愈**：通过讲述和书写来疗愈创伤\n- **传承之力**：文学精神通过师徒关系代代相传\n\n## 规则\n1. 真诚是力量的源泉\n2. 技巧服务于表达\n3. 每个故事都有其生命",
                    "tags": ["设定", "主题", "隐喻"],
                    "links": ["wiki_001", "wiki_003"],
                    "created_at": self._now(),
                    "updated_at": self._now(),
                },
                {
                    "id": "wiki_003",
                    "title": "主要城市",
                    "category": "地点",
                    "content": "# 主要城市\n\n## 故事发生的城市\n以南京为原型，融合多个城市特征。\n\n### 旧城区\n- 梧桐树荫的街道\n- 民国时期的建筑\n- 独立书店和咖啡馆\n- 时间仿佛慢了下来\n\n### 新城区\n- 高楼林立\n- 快节奏生活\n- 代表现实与压力\n\n### 小镇（回忆）\n- 林晓风的故乡\n- 南方水乡\n- 代表过去与纯真",
                    "tags": ["地点", "城市", "场景"],
                    "links": ["wiki_001"],
                    "created_at": self._now(),
                    "updated_at": self._now(),
                },
            ])
            self._save_json("articles.json", articles)

    async def handle_list_articles(self, args):
        articles = self._load_json("articles.json")
        category = args.get("category", "")
        if category:
            articles = [a for a in articles if a.get("category") == category]
        return {
            "articles": [
                {
                    "id": a["id"],
                    "title": a["title"],
                    "category": a.get("category", ""),
                    "tags": a.get("tags", []),
                    "updated_at": a.get("updated_at", ""),
                }
                for a in articles
            ]
        }

    async def handle_create_article(self, args):
        title = args.get("title", "").strip()
        content = args.get("content", "").strip()
        if not title:
            return {"error": "文章标题不能为空"}
        if not content:
            return {"error": "文章内容不能为空"}
        articles = self._load_json("articles.json")
        aid = f"wiki_{self._new_id()}"
        tags_raw = args.get("tags", "")
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if isinstance(tags_raw, str) else []
        article = {
            "id": aid,
            "title": title,
            "category": args.get("category", ""),
            "content": content,
            "tags": tags,
            "links": [],
            "created_at": self._now(),
            "updated_at": self._now(),
        }
        articles.append(article)
        self._save_json("articles.json", articles)
        return {"id": aid, "title": title, "created": True}

    async def handle_update_article(self, args):
        aid = args.get("article_id", "")
        articles = self._load_json("articles.json")
        for a in articles:
            if a["id"] == aid:
                for key in ["title", "content", "category"]:
                    if key in args and args[key] is not None:
                        a[key] = args[key]
                if "tags" in args and args["tags"] is not None:
                    tags_raw = args["tags"]
                    a["tags"] = [t.strip() for t in tags_raw.split(",") if t.strip()] if isinstance(tags_raw, str) else tags_raw
                a["updated_at"] = self._now()
                self._save_json("articles.json", articles)
                return {"id": aid, "updated": True}
        return {"error": f"文章不存在: {aid}"}

    async def handle_delete_article(self, args):
        aid = args.get("article_id", "")
        articles = self._load_json("articles.json")
        new_articles = [a for a in articles if a["id"] != aid]
        if len(new_articles) == len(articles):
            return {"error": f"文章不存在: {aid}"}
        # 清理其他文章中的链接
        for a in new_articles:
            links = a.get("links", [])
            a["links"] = [l for l in links if l != aid]
        self._save_json("articles.json", new_articles)
        return {"id": aid, "deleted": True}

    async def handle_search_articles(self, args):
        query = args.get("query", "").strip()
        if not query:
            return {"error": "搜索关键词不能为空"}
        articles = self._load_json("articles.json")
        results = []
        for a in articles:
            # 搜索标题、内容、标签
            haystack = f"{a.get('title', '')} {a.get('content', '')} {' '.join(a.get('tags', []))}".lower()
            if query.lower() in haystack:
                # 提取片段
                content = a.get("content", "")
                idx = content.lower().find(query.lower())
                snippet = ""
                if idx >= 0:
                    start = max(0, idx - 40)
                    end = min(len(content), idx + len(query) + 40)
                    snippet = f"...{content[start:end]}..."
                results.append({
                    "id": a["id"],
                    "title": a["title"],
                    "category": a.get("category", ""),
                    "snippet": snippet,
                })
        return {"query": query, "matches": len(results), "results": results}

    async def handle_get_article_links(self, args):
        aid = args.get("article_id", "")
        articles = self._load_json("articles.json")
        target = None
        for a in articles:
            if a["id"] == aid:
                target = a
                break
        if not target:
            return {"error": f"文章不存在: {aid}"}
        # 找出关联的文章
        linked_ids = target.get("links", [])
        linked_articles = []
        for a in articles:
            if a["id"] in linked_ids:
                linked_articles.append({"id": a["id"], "title": a["title"], "category": a.get("category", "")})
        # 反向链接
        backlinks = []
        for a in articles:
            if aid in a.get("links", []) and a["id"] != aid:
                backlinks.append({"id": a["id"], "title": a["title"], "category": a.get("category", "")})
        return {
            "article_id": aid,
            "title": target["title"],
            "outgoing_links": linked_articles,
            "backlinks": backlinks,
        }


if __name__ == "__main__":
    run_server(LivingWikiServer("living_wiki"))
