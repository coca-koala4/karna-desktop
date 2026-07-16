"""story_bible — 故事设定集 MCP Server (9 tools)。

管理人物、情节与角色关系。
"""

from __future__ import annotations

from .base import BuiltinMCPServer, run_server


class StoryBibleServer(BuiltinMCPServer):
    server_name = "story_bible"
    server_version = "0.1.0"

    tools = [
        {
            "name": "list_characters",
            "description": "列出所有角色",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "create_character",
            "description": "创建新角色",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "角色姓名"},
                    "role": {"type": "string", "description": "角色定位（主角/配角/反派等）"},
                    "age": {"type": "string", "description": "年龄"},
                    "personality": {"type": "string", "description": "性格特征"},
                    "background": {"type": "string", "description": "背景故事"},
                    "motivation": {"type": "string", "description": "动机"},
                },
                "required": ["name", "role"],
            },
        },
        {
            "name": "update_character",
            "description": "更新角色信息",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "character_id": {"type": "string", "description": "角色ID"},
                    "name": {"type": "string"},
                    "role": {"type": "string"},
                    "age": {"type": "string"},
                    "personality": {"type": "string"},
                    "background": {"type": "string"},
                    "motivation": {"type": "string"},
                },
                "required": ["character_id"],
            },
        },
        {
            "name": "delete_character",
            "description": "删除角色",
            "inputSchema": {
                "type": "object",
                "properties": {"character_id": {"type": "string", "description": "角色ID"}},
                "required": ["character_id"],
            },
        },
        {
            "name": "list_plots",
            "description": "列出所有情节线",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "create_plot",
            "description": "创建新情节线",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "情节标题"},
                    "type": {"type": "string", "description": "类型（主线/支线/伏笔）"},
                    "summary": {"type": "string", "description": "情节概要"},
                    "status": {"type": "string", "enum": ["planned", "in_progress", "resolved"], "description": "状态"},
                },
                "required": ["title", "type"],
            },
        },
        {
            "name": "update_plot",
            "description": "更新情节线",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "plot_id": {"type": "string", "description": "情节ID"},
                    "title": {"type": "string"},
                    "summary": {"type": "string"},
                    "status": {"type": "string", "enum": ["planned", "in_progress", "resolved"]},
                },
                "required": ["plot_id"],
            },
        },
        {
            "name": "get_relationships",
            "description": "获取角色关系列表",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "add_relationship",
            "description": "添加角色关系",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "from_character_id": {"type": "string", "description": "起始角色ID"},
                    "to_character_id": {"type": "string", "description": "目标角色ID"},
                    "relation_type": {"type": "string", "description": "关系类型（友情/爱情/敌对/师徒等）"},
                    "description": {"type": "string", "description": "关系描述"},
                },
                "required": ["from_character_id", "to_character_id", "relation_type"],
            },
        },
        {
            "name": "extract_story_bible_from_chapter",
            "description": "从章节文本中抽取候选人物和事件",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "chapter_text": {"type": "string", "description": "章节正文"},
                    "chapter_title": {"type": "string", "description": "章节标题"},
                },
                "required": ["chapter_text"],
            },
        },
    ]

    def __init__(self, connector_id: str = "story_bible"):
        super().__init__(connector_id)
        self._init_sample_data()

    def _init_sample_data(self):
        """预置示例角色、情节和关系。"""
        characters = self._load_json("characters.json")
        if not characters:
            characters.extend([
                {
                    "id": "char_001",
                    "name": "林晓风",
                    "role": "主角",
                    "age": "24",
                    "personality": "内向敏感，有强烈的正义感，但缺乏自信。来自乡村，对城市生活既向往又恐惧。",
                    "background": "出生于南方小镇，父母早逝，由奶奶抚养长大。从小热爱写作，带着 manuscript 来到大城市追梦。",
                    "motivation": "成为一名真正的作家，证明自己的价值",
                    "created_at": self._now(),
                },
                {
                    "id": "char_002",
                    "name": "苏雨桐",
                    "role": "女主角",
                    "age": "26",
                    "personality": "外柔内刚，独立自强。表面温和，内心有自己的坚持。",
                    "background": "城市本地人，小学语文教师。家庭条件优越但与家人关系紧张，渴望真正的理解与连接。",
                    "motivation": "寻找心灵的归属感，逃离家庭的控制",
                    "created_at": self._now(),
                },
                {
                    "id": "char_003",
                    "name": "老陈",
                    "role": "导师",
                    "age": "68",
                    "personality": "睿智豁达，言辞犀利但心怀慈悲。喜欢用故事讲道理。",
                    "background": "退休的大学文学教授，妻子去世后独居。曾是知名作家，后因故封笔。",
                    "motivation": "在有生之年找到文学的传承者",
                    "created_at": self._now(),
                },
            ])
            self._save_json("characters.json", characters)

        plots = self._load_json("plots.json")
        if not plots:
            plots.extend([
                {
                    "id": "plot_001",
                    "title": "相遇与成长",
                    "type": "主线",
                    "summary": "林晓风来到城市，结识苏雨桐和老陈，在写作中找到自我。经历理想与现实的碰撞后，最终找到自己的声音。",
                    "status": "in_progress",
                    "created_at": self._now(),
                },
                {
                    "id": "plot_002",
                    "title": "老陈的秘密",
                    "type": "支线",
                    "summary": "老陈为何封笔？他隐藏的过去是什么？这条线将在后半段揭晓，并与主线产生交汇。",
                    "status": "planned",
                    "created_at": self._now(),
                },
            ])
            self._save_json("plots.json", plots)

        relationships = self._load_json("relationships.json")
        if not relationships:
            relationships.extend([
                {
                    "id": "rel_001",
                    "from": "char_001",
                    "to": "char_002",
                    "type": "爱情",
                    "description": "林晓风与苏雨桐在书店相遇，从陌生到相知，逐渐产生感情。",
                    "created_at": self._now(),
                },
                {
                    "id": "rel_002",
                    "from": "char_001",
                    "to": "char_003",
                    "type": "师徒",
                    "description": "老陈发现林晓风的写作天赋，主动指导他。两人形成亦师亦友的关系。",
                    "created_at": self._now(),
                },
            ])
            self._save_json("relationships.json", relationships)

    async def handle_list_characters(self, args):
        characters = self._load_json("characters.json")
        return {
            "characters": [
                {"id": c["id"], "name": c["name"], "role": c.get("role", ""), "age": c.get("age", "")}
                for c in characters
            ]
        }

    async def handle_create_character(self, args):
        name = args.get("name", "").strip()
        if not name:
            return {"error": "角色姓名不能为空"}
        characters = self._load_json("characters.json")
        cid = f"char_{self._new_id()}"
        character = {
            "id": cid,
            "name": name,
            "role": args.get("role", ""),
            "age": args.get("age", ""),
            "personality": args.get("personality", ""),
            "background": args.get("background", ""),
            "motivation": args.get("motivation", ""),
            "created_at": self._now(),
        }
        characters.append(character)
        self._save_json("characters.json", characters)
        return {"id": cid, "name": name, "created": True}

    async def handle_update_character(self, args):
        cid = args.get("character_id", "")
        characters = self._load_json("characters.json")
        for c in characters:
            if c["id"] == cid:
                for key in ["name", "role", "age", "personality", "background", "motivation"]:
                    if key in args and args[key] is not None:
                        c[key] = args[key]
                self._save_json("characters.json", characters)
                return {"id": cid, "updated": True}
        return {"error": f"角色不存在: {cid}"}

    async def handle_delete_character(self, args):
        cid = args.get("character_id", "")
        characters = self._load_json("characters.json")
        new_chars = [c for c in characters if c["id"] != cid]
        if len(new_chars) == len(characters):
            return {"error": f"角色不存在: {cid}"}
        self._save_json("characters.json", new_chars)
        # 同时删除相关关系
        rels = self._load_json("relationships.json")
        rels = [r for r in rels if r.get("from") != cid and r.get("to") != cid]
        self._save_json("relationships.json", rels)
        return {"id": cid, "deleted": True}

    async def handle_list_plots(self, args):
        plots = self._load_json("plots.json")
        return {
            "plots": [
                {"id": p["id"], "title": p["title"], "type": p.get("type", ""), "status": p.get("status", "")}
                for p in plots
            ]
        }

    async def handle_create_plot(self, args):
        title = args.get("title", "").strip()
        if not title:
            return {"error": "情节标题不能为空"}
        plots = self._load_json("plots.json")
        pid = f"plot_{self._new_id()}"
        plot = {
            "id": pid,
            "title": title,
            "type": args.get("type", "主线"),
            "summary": args.get("summary", ""),
            "status": args.get("status", "planned"),
            "created_at": self._now(),
        }
        plots.append(plot)
        self._save_json("plots.json", plots)
        return {"id": pid, "title": title, "created": True}

    async def handle_update_plot(self, args):
        pid = args.get("plot_id", "")
        plots = self._load_json("plots.json")
        for p in plots:
            if p["id"] == pid:
                for key in ["title", "summary", "status"]:
                    if key in args and args[key] is not None:
                        p[key] = args[key]
                self._save_json("plots.json", plots)
                return {"id": pid, "updated": True}
        return {"error": f"情节不存在: {pid}"}

    async def handle_get_relationships(self, args):
        rels = self._load_json("relationships.json")
        characters = self._load_json("characters.json")
        char_map = {c["id"]: c["name"] for c in characters}
        return {
            "relationships": [
                {
                    "id": r["id"],
                    "from_name": char_map.get(r.get("from"), r.get("from")),
                    "to_name": char_map.get(r.get("to"), r.get("to")),
                    "type": r.get("type", ""),
                    "description": r.get("description", ""),
                }
                for r in rels
            ]
        }

    async def handle_add_relationship(self, args):
        from_id = args.get("from_character_id", "")
        to_id = args.get("to_character_id", "")
        rel_type = args.get("relation_type", "").strip()
        if not from_id or not to_id or not rel_type:
            return {"error": "起始角色、目标角色和关系类型不能为空"}
        rels = self._load_json("relationships.json")
        rid = f"rel_{self._new_id()}"
        rel = {
            "id": rid,
            "from": from_id,
            "to": to_id,
            "type": rel_type,
            "description": args.get("description", ""),
            "created_at": self._now(),
        }
        rels.append(rel)
        self._save_json("relationships.json", rels)
        return {"id": rid, "created": True}

    async def handle_extract_story_bible_from_chapter(self, args):
        import re

        text = str(args.get("chapter_text") or "")
        title = str(args.get("chapter_title") or "")
        if not text.strip():
            return {"chapter_title": title, "characters": [], "events": []}

        stop_words = {"他们", "我们", "你们", "这个", "那个", "自己", "突然", "只是", "没有", "已经", "因为", "所以", "但是", "如果"}
        names: dict[str, int] = {}
        for match in re.finditer(r"[\u4e00-\u9fff]{2,4}", text):
            token = match.group(0)
            if token in stop_words:
                continue
            if any(word in token for word in ["时候", "起来", "一样", "什么", "这里", "那里"]):
                continue
            names[token] = names.get(token, 0) + 1
        characters = [
            {"name": name, "mentions": count, "confidence": "medium" if count > 1 else "low"}
            for name, count in sorted(names.items(), key=lambda kv: (-kv[1], kv[0]))[:12]
        ]

        event_verbs = "发现|决定|离开|回来|争吵|承认|隐藏|寻找|失去|得到|遇见|拒绝|答应|怀疑|背叛|保护|杀死|救下|调查|揭开"
        events = []
        for sentence in re.split(r"[。！？!?\n]+", text):
            sentence = sentence.strip()
            if not sentence:
                continue
            if re.search(event_verbs, sentence):
                events.append({"summary": sentence[:160], "type": "candidate_event"})
            if len(events) >= 10:
                break
        return {"chapter_title": title, "characters": characters, "events": events}


if __name__ == "__main__":
    run_server(StoryBibleServer("story_bible"))
