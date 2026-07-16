"""soul_workshop — 灵魂工坊 MCP Server (5 tools)。

管理角色人格，提供模板化对话。
"""

from __future__ import annotations

from .base import BuiltinMCPServer, run_server


class SoulWorkshopServer(BuiltinMCPServer):
    server_name = "soul_workshop"
    server_version = "0.1.0"

    tools = [
        {
            "name": "list_personas",
            "description": "列出所有角色人格",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "create_persona",
            "description": "创建新角色人格",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "人格名称"},
                    "description": {"type": "string", "description": "人格描述"},
                    "traits": {"type": "string", "description": "性格特征，逗号分隔"},
                    "speaking_style": {"type": "string", "description": "说话风格"},
                    "catchphrase": {"type": "string", "description": "口头禅"},
                    "background": {"type": "string", "description": "背景故事"},
                    "tags": {"type": "string", "description": "标签，逗号分隔"},
                },
                "required": ["name", "description"],
            },
        },
        {
            "name": "update_persona",
            "description": "更新角色人格",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "persona_id": {"type": "string", "description": "人格ID"},
                    "name": {"type": "string"},
                    "description": {"type": "string"},
                    "traits": {"type": "string"},
                    "speaking_style": {"type": "string"},
                    "catchphrase": {"type": "string"},
                    "background": {"type": "string"},
                    "tags": {"type": "string"},
                },
                "required": ["persona_id"],
            },
        },
        {
            "name": "delete_persona",
            "description": "删除角色人格",
            "inputSchema": {
                "type": "object",
                "properties": {"persona_id": {"type": "string", "description": "人格ID"}},
                "required": ["persona_id"],
            },
        },
        {
            "name": "dialogue_with_character",
            "description": "与角色对话（基于人格特征生成模板化回复）",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "persona_id": {"type": "string", "description": "人格ID"},
                    "message": {"type": "string", "description": "对话消息"},
                    "context": {"type": "string", "description": "对话场景/上下文（可选）"},
                },
                "required": ["persona_id", "message"],
            },
        },
    ]

    def __init__(self, connector_id: str = "soul_workshop"):
        super().__init__(connector_id)
        self._init_sample_data()

    def _init_sample_data(self):
        """预置示例人格。"""
        personas = self._load_json("personas.json")
        if not personas:
            personas.extend([
                {
                    "id": "persona_001",
                    "name": "林晓风",
                    "description": "来自乡村的青年作家，内向敏感但内心坚韧。对文学充满热情，在城市中寻找自己的位置。",
                    "traits": ["内向", "敏感", "坚韧", "理想主义", "善良"],
                    "speaking_style": "话不多，但每句都经过思考。喜欢用比喻，偶尔引用读过的诗句。语气谦和但有时会突然变得坚定。",
                    "catchphrase": "我想……试试看。",
                    "background": "从小在南方小镇长大，父母早逝。带着对写作的热爱来到大城市，正在经历成长的阵痛。",
                    "tags": ["主角", "作家", "成长"],
                    "created_at": self._now(),
                },
                {
                    "id": "persona_002",
                    "name": "老陈",
                    "description": "退休文学教授，睿智豁达。曾经是一位著名作家，因某件事封笔多年。现在寻找文学的传承者。",
                    "traits": ["睿智", "犀利", "慈悲", "幽默", "通透"],
                    "speaking_style": "喜欢用故事讲道理，言辞犀利但不刻薄。经常引用经典文学作品，偶尔冒出让人忍俊不禁的俏皮话。",
                    "catchphrase": "文字不会骗人，骗人的是人。",
                    "background": "曾是大学文学教授和知名作家。妻子去世后选择隐居，直到遇到林晓风，重新燃起了对文学传承的希望。",
                    "tags": ["导师", "教授", "作家"],
                    "created_at": self._now(),
                },
            ])
            self._save_json("personas.json", personas)

    async def handle_list_personas(self, args):
        personas = self._load_json("personas.json")
        return {
            "personas": [
                {
                    "id": p["id"],
                    "name": p["name"],
                    "description": p.get("description", ""),
                    "traits": p.get("traits", []),
                    "tags": p.get("tags", []),
                }
                for p in personas
            ]
        }

    async def handle_create_persona(self, args):
        name = args.get("name", "").strip()
        description = args.get("description", "").strip()
        if not name:
            return {"error": "人格名称不能为空"}
        if not description:
            return {"error": "人格描述不能为空"}
        personas = self._load_json("personas.json")
        pid = f"persona_{self._new_id()}"
        traits_raw = args.get("traits", "")
        traits = [t.strip() for t in traits_raw.split(",") if t.strip()] if isinstance(traits_raw, str) else []
        tags_raw = args.get("tags", "")
        tags = [t.strip() for t in tags_raw.split(",") if t.strip()] if isinstance(tags_raw, str) else []
        persona = {
            "id": pid,
            "name": name,
            "description": description,
            "traits": traits,
            "speaking_style": args.get("speaking_style", ""),
            "catchphrase": args.get("catchphrase", ""),
            "background": args.get("background", ""),
            "tags": tags,
            "created_at": self._now(),
        }
        personas.append(persona)
        self._save_json("personas.json", personas)
        return {"id": pid, "name": name, "created": True}

    async def handle_update_persona(self, args):
        pid = args.get("persona_id", "")
        personas = self._load_json("personas.json")
        for p in personas:
            if p["id"] == pid:
                for key in ["name", "description", "speaking_style", "catchphrase", "background"]:
                    if key in args and args[key] is not None:
                        p[key] = args[key]
                if "traits" in args and args["traits"] is not None:
                    traits_raw = args["traits"]
                    p["traits"] = [t.strip() for t in traits_raw.split(",") if t.strip()] if isinstance(traits_raw, str) else traits_raw
                if "tags" in args and args["tags"] is not None:
                    tags_raw = args["tags"]
                    p["tags"] = [t.strip() for t in tags_raw.split(",") if t.strip()] if isinstance(tags_raw, str) else tags_raw
                self._save_json("personas.json", personas)
                return {"id": pid, "updated": True}
        return {"error": f"人格不存在: {pid}"}

    async def handle_delete_persona(self, args):
        pid = args.get("persona_id", "")
        personas = self._load_json("personas.json")
        new_personas = [p for p in personas if p["id"] != pid]
        if len(new_personas) == len(personas):
            return {"error": f"人格不存在: {pid}"}
        self._save_json("personas.json", new_personas)
        return {"id": pid, "deleted": True}

    async def handle_dialogue_with_character(self, args):
        pid = args.get("persona_id", "")
        message = args.get("message", "").strip()
        context = args.get("context", "")
        if not message:
            return {"error": "消息不能为空"}
        personas = self._load_json("personas.json")
        persona = None
        for p in personas:
            if p["id"] == pid:
                persona = p
                break
        if not persona:
            return {"error": f"人格不存在: {pid}"}

        # 基于人格特征生成模板化回复
        name = persona.get("name", "角色")
        traits = persona.get("traits", [])
        speaking_style = persona.get("speaking_style", "")
        catchphrase = persona.get("catchphrase", "")

        # 根据消息类型生成不同回复模板
        if any(w in message for w in ["你好", "嗨", "hello", "hi"]):
            greeting = f"*{name}微微点头* "
            if "内向" in traits:
                reply = f"{greeting}你好……我是{name}。"
            elif "幽默" in traits:
                reply = f"{greeting}哟，稀客啊！坐坐坐，正好我刚泡了茶。"
            else:
                reply = f"{greeting}你好，很高兴见到你。"
        elif any(w in message for w in ["写作", "写", "文学", "书"]):
            if "理想主义" in traits:
                reply = f"*{name}的眼睛亮了起来* 写作啊……那是我最热爱的事。文字有一种力量，能把转瞬即逝的感觉永远留住。"
            else:
                reply = f"*{name}放下手中的书* 写作？这是个好话题。你知道吗，好的文字不是写出来的，是从心里长出来的。"
        elif any(w in message for w in ["困难", "难", "怎么办", "迷茫"]):
            if "睿智" in traits:
                reply = f"*{name}微微一笑* 年轻人，迷茫是好事，说明你在思考。我像你这么大的时候，比你还迷茫呢。来，我给你讲个故事……"
            elif "坚韧" in traits:
                reply = f"*{name}坚定地看着你* 困难只是暂时的。只要你不放弃，就还有希望。我们一起想办法。"
            else:
                reply = f"*{name}沉思片刻* 每个困难都是一次成长的机会。你想听听我的经历吗？"
        else:
            # 通用回复
            trait_desc = "、".join(traits[:3]) if traits else "普通"
            reply = f"*{name}认真地听着你的话*\n\n"
            if context:
                reply += f"（在{context}的场景中）\n\n"
            reply += f"嗯，我理解你的意思。"
            if catchphrase:
                reply += f"\n\n正如我常说的——{catchphrase}"

        return {
            "persona_id": pid,
            "persona_name": name,
            "message": message,
            "reply": reply,
            "traits_used": traits[:3],
        }


if __name__ == "__main__":
    run_server(SoulWorkshopServer("soul_workshop"))
