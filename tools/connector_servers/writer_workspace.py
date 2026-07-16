"""writer_workspace — 写作工作台 MCP Server (10 tools)。

管理写作项目、文件读写、搜索与导出。
"""

from __future__ import annotations

import os
from pathlib import Path

from .base import BuiltinMCPServer, run_server


class WriterWorkspaceServer(BuiltinMCPServer):
    server_name = "writer_workspace"
    server_version = "0.1.0"

    tools = [
        {
            "name": "list_projects",
            "description": "列出所有写作项目",
            "inputSchema": {"type": "object", "properties": {}, "required": []},
        },
        {
            "name": "create_project",
            "description": "创建新的写作项目",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "name": {"type": "string", "description": "项目名称"},
                    "description": {"type": "string", "description": "项目描述"},
                    "genre": {"type": "string", "description": "类型（如：小说、散文、剧本）"},
                },
                "required": ["name"],
            },
        },
        {
            "name": "get_project_info",
            "description": "获取项目详细信息",
            "inputSchema": {
                "type": "object",
                "properties": {"project_id": {"type": "string", "description": "项目ID"}},
                "required": ["project_id"],
            },
        },
        {
            "name": "list_files",
            "description": "列出项目中的文件",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "项目ID"},
                    "directory": {"type": "string", "description": "子目录路径（可选）"},
                },
                "required": ["project_id"],
            },
        },
        {
            "name": "read_file",
            "description": "读取项目文件内容",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "项目ID"},
                    "file_path": {"type": "string", "description": "文件相对路径"},
                },
                "required": ["project_id", "file_path"],
            },
        },
        {
            "name": "write_file",
            "description": "写入或创建项目文件",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "项目ID"},
                    "file_path": {"type": "string", "description": "文件相对路径"},
                    "content": {"type": "string", "description": "文件内容"},
                },
                "required": ["project_id", "file_path", "content"],
            },
        },
        {
            "name": "delete_file",
            "description": "删除项目文件",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "项目ID"},
                    "file_path": {"type": "string", "description": "文件相对路径"},
                },
                "required": ["project_id", "file_path"],
            },
        },
        {
            "name": "search_content",
            "description": "在项目中搜索文本内容",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "项目ID"},
                    "query": {"type": "string", "description": "搜索关键词"},
                },
                "required": ["project_id", "query"],
            },
        },
        {
            "name": "get_project_stats",
            "description": "获取项目统计信息（字数、文件数等）",
            "inputSchema": {
                "type": "object",
                "properties": {"project_id": {"type": "string", "description": "项目ID"}},
                "required": ["project_id"],
            },
        },
        {
            "name": "export_project",
            "description": "导出项目为指定格式",
            "inputSchema": {
                "type": "object",
                "properties": {
                    "project_id": {"type": "string", "description": "项目ID"},
                    "format": {
                        "type": "string",
                        "enum": ["txt", "md", "json"],
                        "description": "导出格式",
                    },
                },
                "required": ["project_id", "format"],
            },
        },
    ]

    def __init__(self, connector_id: str = "writer_workspace"):
        super().__init__(connector_id)
        self._init_sample_data()

    def _init_sample_data(self):
        """预置示例项目。"""
        projects = self._load_json("projects.json")
        if not projects:
            projects.append(
                {
                    "id": "proj_sample_001",
                    "name": "我的第一部小说",
                    "description": "一个关于成长与救赎的故事",
                    "genre": "小说",
                    "created_at": self._now(),
                    "updated_at": self._now(),
                    "root_path": str(self.data_dir / "workspace" / "我的第一部小说"),
                    "files": [
                        {"path": "第一章_初见.md", "content": "# 第一章 初见\n\n那是一个雨后的清晨，林晓风第一次踏入了这座城市。\n\n空气中弥漫着泥土和桂花混合的香气，街道两旁的梧桐树在微风中轻轻摇曳。"},
                        {"path": "第二章_离别.md", "content": "# 第二章 离别\n\n苏雨桐站在车站的月台上，手中紧握着一张单程车票。\n\n她知道，这一别，或许就是永远。"},
                        {"path": "大纲.md", "content": "# 大纲\n\n## 主题\n成长与救赎\n\n## 主要人物\n- 林晓风：主角，一个从乡村来到城市的青年\n- 苏雨桐：女主角，城市里的教师\n- 老陈：导师，退休教授\n\n## 情节线\n1. 相遇：林晓风来到城市，结识苏雨桐\n2. 成长：在老陈的指导下学习写作\n3. 冲突：理想与现实的碰撞\n4. 救赎：找回初心"},
                    ],
                }
            )
            self._save_json("projects.json", projects)
            # 创建示例文件目录
            ws_dir = self.data_dir / "workspace" / "我的第一部小说"
            ws_dir.mkdir(parents=True, exist_ok=True)
            for f in projects[0]["files"]:
                fp = ws_dir / f["path"]
                fp.write_text(f["content"], encoding="utf-8")

    def _find_project(self, project_id: str):
        projects = self._load_json("projects.json")
        for p in projects:
            if p["id"] == project_id:
                return p
        return None

    async def handle_list_projects(self, args):
        projects = self._load_json("projects.json")
        return {
            "projects": [
                {"id": p["id"], "name": p["name"], "genre": p.get("genre", ""), "updated_at": p.get("updated_at")}
                for p in projects
            ]
        }

    async def handle_create_project(self, args):
        name = args.get("name", "").strip()
        if not name:
            return {"error": "项目名称不能为空"}
        projects = self._load_json("projects.json")
        pid = f"proj_{self._new_id()}"
        project = {
            "id": pid,
            "name": name,
            "description": args.get("description", ""),
            "genre": args.get("genre", ""),
            "created_at": self._now(),
            "updated_at": self._now(),
            "root_path": str(self.data_dir / "workspace" / name),
            "files": [],
        }
        projects.append(project)
        self._save_json("projects.json", projects)
        # 创建目录
        (self.data_dir / "workspace" / name).mkdir(parents=True, exist_ok=True)
        return {"id": pid, "name": name, "created": True}

    async def handle_get_project_info(self, args):
        pid = args.get("project_id", "")
        project = self._find_project(pid)
        if not project:
            return {"error": f"项目不存在: {pid}"}
        return {
            "id": project["id"],
            "name": project["name"],
            "description": project.get("description", ""),
            "genre": project.get("genre", ""),
            "created_at": project.get("created_at"),
            "updated_at": project.get("updated_at"),
            "file_count": len(project.get("files", [])),
        }

    async def handle_list_files(self, args):
        pid = args.get("project_id", "")
        project = self._find_project(pid)
        if not project:
            return {"error": f"项目不存在: {pid}"}
        directory = args.get("directory", "")
        files = project.get("files", [])
        if directory:
            files = [f for f in files if f["path"].startswith(directory)]
        return {"files": [{"path": f["path"], "size": len(f.get("content", ""))} for f in files]}

    async def handle_read_file(self, args):
        pid = args.get("project_id", "")
        fp = args.get("file_path", "")
        project = self._find_project(pid)
        if not project:
            return {"error": f"项目不存在: {pid}"}
        for f in project.get("files", []):
            if f["path"] == fp:
                return {"path": fp, "content": f.get("content", "")}
        # 尝试从文件系统读取
        root = Path(project.get("root_path", ""))
        full_path = root / fp
        if full_path.exists():
            content = full_path.read_text(encoding="utf-8")
            return {"path": fp, "content": content}
        return {"error": f"文件不存在: {fp}"}

    async def handle_write_file(self, args):
        pid = args.get("project_id", "")
        fp = args.get("file_path", "")
        content = args.get("content", "")
        project = self._find_project(pid)
        if not project:
            return {"error": f"项目不存在: {pid}"}
        # 更新项目文件列表
        files = project.get("files", [])
        found = False
        for f in files:
            if f["path"] == fp:
                f["content"] = content
                found = True
                break
        if not found:
            files.append({"path": fp, "content": content})
        project["files"] = files
        project["updated_at"] = self._now()
        # 保存
        projects = self._load_json("projects.json")
        for i, p in enumerate(projects):
            if p["id"] == pid:
                projects[i] = project
                break
        self._save_json("projects.json", projects)
        # 写入文件系统
        root = Path(project.get("root_path", ""))
        full_path = root / fp
        full_path.parent.mkdir(parents=True, exist_ok=True)
        full_path.write_text(content, encoding="utf-8")
        return {"path": fp, "written": True, "size": len(content)}

    async def handle_delete_file(self, args):
        pid = args.get("project_id", "")
        fp = args.get("file_path", "")
        project = self._find_project(pid)
        if not project:
            return {"error": f"项目不存在: {pid}"}
        files = project.get("files", [])
        new_files = [f for f in files if f["path"] != fp]
        if len(new_files) == len(files):
            return {"error": f"文件不存在: {fp}"}
        project["files"] = new_files
        project["updated_at"] = self._now()
        projects = self._load_json("projects.json")
        for i, p in enumerate(projects):
            if p["id"] == pid:
                projects[i] = project
                break
        self._save_json("projects.json", projects)
        # 删除文件系统文件
        root = Path(project.get("root_path", ""))
        full_path = root / fp
        if full_path.exists():
            full_path.unlink()
        return {"path": fp, "deleted": True}

    async def handle_search_content(self, args):
        pid = args.get("project_id", "")
        query = args.get("query", "").strip()
        if not query:
            return {"error": "搜索关键词不能为空"}
        project = self._find_project(pid)
        if not project:
            return {"error": f"项目不存在: {pid}"}
        results = []
        for f in project.get("files", []):
            content = f.get("content", "")
            if query in content:
                # 找到匹配位置
                idx = content.find(query)
                start = max(0, idx - 50)
                end = min(len(content), idx + len(query) + 50)
                snippet = content[start:end]
                results.append({"path": f["path"], "snippet": f"...{snippet}...", "position": idx})
        return {"query": query, "matches": len(results), "results": results}

    async def handle_get_project_stats(self, args):
        pid = args.get("project_id", "")
        project = self._find_project(pid)
        if not project:
            return {"error": f"项目不存在: {pid}"}
        files = project.get("files", [])
        total_chars = sum(len(f.get("content", "")) for f in files)
        # 估算中文字数（按字符数）
        total_words = total_chars
        md_files = [f for f in files if f["path"].endswith(".md")]
        return {
            "project_id": pid,
            "name": project["name"],
            "total_files": len(files),
            "total_characters": total_chars,
            "estimated_words": total_words,
            "markdown_files": len(md_files),
        }

    async def handle_export_project(self, args):
        pid = args.get("project_id", "")
        fmt = args.get("format", "txt")
        project = self._find_project(pid)
        if not project:
            return {"error": f"项目不存在: {pid}"}
        files = project.get("files", [])
        if fmt == "txt":
            content = "\n\n".join(f.get("content", "") for f in files)
        elif fmt == "md":
            parts = []
            for f in files:
                if f["path"].endswith(".md"):
                    parts.append(f.get("content", ""))
            content = "\n\n---\n\n".join(parts)
        elif fmt == "json":
            import json
            content = json.dumps(
                {"project": project["name"], "files": [{"path": f["path"], "content": f.get("content", "")} for f in files]},
                ensure_ascii=False,
                indent=2,
            )
        else:
            return {"error": f"不支持的格式: {fmt}"}
        return {"format": fmt, "size": len(content), "content": content}


if __name__ == "__main__":
    run_server(WriterWorkspaceServer("writer_workspace"))
