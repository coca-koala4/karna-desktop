"""narrative_state — 叙事状态追踪 MCP Server (6 tools)。

追踪场景、进度与叙事弧线。
"""

from __future__ import annotations

from .base import BuiltinMCPServer, run_server


class NarrativeStateServer(BuiltinMCPServer):
    server_name = "narrative_state"
    server_version = "0.1.0"

    tools = [
        {
            "name": "track_scene",
            "description": "记录/追踪一个场景",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "title": {"type": "string", "description": "场景标题"},
                    "chapter": {"type": "string", "description": "所属章节"},
                    "pov_character": {"type": "string", "description": "视角角色"},
                    "location": {"type": "string", "description": "地点"},
                    "time": {"type": "string", "description": "时间（故事内时间）"},
                    "mood": {"type": "string", "description": "氛围/情绪"},
                    "summary": {"type": "string", "description": "场景概要"},
                    "tension_level": {"type": "string", "description": "紧张度 (1-10)"},
                },
                "required": ["title"],
            },
        },
        {
            "name": "list_scenes",
            "description": "列出所有已追踪的场景",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "chapter": {"type": "string", "description": "按章节筛选（可选）"},
                },
                "required": [],
            },
        },
        {
            "name": "get_story_timeline",
            "description": "获取故事时间线",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "get_progress",
            "description": "获取写作进度",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "update_progress",
            "description": "更新写作进度",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "current_chapter": {"type": "string", "description": "当前章节"},
                    "word_count": {"type": "string", "description": "当前字数"},
                    "target_word_count": {"type": "string", "description": "目标字数"},
                    "notes": {"type": "string", "description": "进度备注"},
                },
                "required": [],
            },
        },
        {
            "name": "get_narrative_arc",
            "description": "获取叙事弧线分析（起承转合）",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
    ]

    def __init__(self, connector_id: str = "narrative_state"):
        super().__init__(connector_id)
        self._init_sample_data()

    def _init_sample_data(self):
        """预置示例场景和进度。"""
        scenes = self._load_json("scenes.json")
        if not scenes:
            scenes.extend([
                {
                    "id": "scene_001",
                    "title": "雨后的清晨",
                    "chapter": "第一章",
                    "pov_character": "林晓风",
                    "location": "城市火车站",
                    "time": "故事第1天 早晨",
                    "mood": "希望与忐忑",
                    "summary": "林晓风带着 manuscript 抵达城市，对未来充满期待又感到不安。",
                    "tension_level": "3",
                    "created_at": self._now(),
                },
                {
                    "id": "scene_002",
                    "title": "书店邂逅",
                    "chapter": "第二章",
                    "pov_character": "林晓风",
                    "location": "旧城区书店",
                    "time": "故事第3天 下午",
                    "mood": "温暖、心动",
                    "summary": "在书店里偶遇苏雨桐，两人因一本绝版书产生交集。",
                    "tension_level": "4",
                    "created_at": self._now(),
                },
                {
                    "id": "scene_003",
                    "title": "老陈的考验",
                    "chapter": "第三章",
                    "pov_character": "林晓风",
                    "location": "老陈的公寓",
                    "time": "故事第7天 晚上",
                    "mood": "紧张、敬畏",
                    "summary": "老陈要求林晓风现场写一篇短文，以此测试他的才华和决心。",
                    "tension_level": "6",
                    "created_at": self._now(),
                },
            ])
            self._save_json("scenes.json", scenes)

        progress = self._load_json("progress.json")
        if not progress:
            progress.append({
                "id": "progress_001",
                "current_chapter": "第三章",
                "word_count": 12000,
                "target_word_count": 80000,
                "notes": "前三章初稿完成，需要修改润色",
                "updated_at": self._now(),
            })
            self._save_json("progress.json", progress)

    async def handle_track_scene(self, args):
        title = args.get("title", "").strip()
        if not title:
            return {"error": "场景标题不能为空"}
        scenes = self._load_json("scenes.json")
        sid = f"scene_{self._new_id()}"
        scene = {
            "id": sid,
            "title": title,
            "chapter": args.get("chapter", ""),
            "pov_character": args.get("pov_character", ""),
            "location": args.get("location", ""),
            "time": args.get("time", ""),
            "mood": args.get("mood", ""),
            "summary": args.get("summary", ""),
            "tension_level": args.get("tension_level", "5"),
            "created_at": self._now(),
        }
        scenes.append(scene)
        self._save_json("scenes.json", scenes)
        return {"id": sid, "title": title, "tracked": True}

    async def handle_list_scenes(self, args):
        scenes = self._load_json("scenes.json")
        chapter = args.get("chapter", "")
        if chapter:
            scenes = [s for s in scenes if s.get("chapter") == chapter]
        return {
            "scenes": [
                {
                    "id": s["id"],
                    "title": s["title"],
                    "chapter": s.get("chapter", ""),
                    "pov_character": s.get("pov_character", ""),
                    "mood": s.get("mood", ""),
                    "tension_level": s.get("tension_level", ""),
                }
                for s in scenes
            ]
        }

    async def handle_get_story_timeline(self, args):
        scenes = self._load_json("scenes.json")
        # 按时间排序
        timeline = sorted(scenes, key=lambda s: s.get("time", ""))
        return {
            "timeline": [
                {
                    "title": s["title"],
                    "time": s.get("time", ""),
                    "chapter": s.get("chapter", ""),
                    "location": s.get("location", ""),
                    "pov_character": s.get("pov_character", ""),
                }
                for s in timeline
            ]
        }

    async def handle_get_progress(self, args):
        progress_list = self._load_json("progress.json")
        if not progress_list:
            return {"current_chapter": "", "word_count": 0, "target_word_count": 0, "percentage": 0}
        p = progress_list[-1]  # 最新进度
        wc = p.get("word_count", 0)
        twc = p.get("target_word_count", 1)
        return {
            "current_chapter": p.get("current_chapter", ""),
            "word_count": wc,
            "target_word_count": twc,
            "percentage": round(wc / twc * 100, 1) if twc > 0 else 0,
            "notes": p.get("notes", ""),
            "updated_at": p.get("updated_at", ""),
        }

    async def handle_update_progress(self, args):
        progress_list = self._load_json("progress.json")
        if progress_list:
            p = progress_list[-1]
        else:
            p = {"id": f"progress_{self._new_id()}"}
        if "current_chapter" in args and args["current_chapter"] is not None:
            p["current_chapter"] = args["current_chapter"]
        if "word_count" in args and args["word_count"] is not None:
            try:
                p["word_count"] = int(args["word_count"])
            except (ValueError, TypeError):
                pass
        if "target_word_count" in args and args["target_word_count"] is not None:
            try:
                p["target_word_count"] = int(args["target_word_count"])
            except (ValueError, TypeError):
                pass
        if "notes" in args and args["notes"] is not None:
            p["notes"] = args["notes"]
        p["updated_at"] = self._now()
        if not progress_list:
            progress_list.append(p)
        else:
            progress_list[-1] = p
        self._save_json("progress.json", progress_list)
        return {"updated": True, "progress": p}

    async def handle_get_narrative_arc(self, args):
        scenes = self._load_json("scenes.json")
        if not scenes:
            return {"arc": [], "summary": "暂无场景数据"}
        # 分析紧张度变化
        arc = []
        for s in scenes:
            try:
                tension = int(s.get("tension_level", 5))
            except (ValueError, TypeError):
                tension = 5
            arc.append({
                "title": s["title"],
                "chapter": s.get("chapter", ""),
                "tension": tension,
            })
        # 判断叙事阶段
        if len(arc) >= 3:
            rising = arc[:len(arc)//2]
            falling = arc[len(arc)//2:]
            rising_avg = sum(a["tension"] for a in rising) / len(rising) if rising else 0
            falling_avg = sum(a["tension"] for a in falling) / len(falling) if falling else 0
            if rising_avg < falling_avg:
                phase = "上升动作（Rising Action）"
            else:
                phase = "下降动作（Falling Action）"
        else:
            phase = " exposition（铺垫）"
        return {
            "arc": arc,
            "phase": phase,
            "total_scenes": len(scenes),
            "avg_tension": round(sum(a["tension"] for a in arc) / len(arc), 1) if arc else 0,
        }


if __name__ == "__main__":
    run_server(NarrativeStateServer("narrative_state"))
