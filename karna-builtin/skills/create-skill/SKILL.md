---
name: create-skill
description: 创建可持久化的 Karna 本地技能，生成标准 SKILL.md，并立即进入技能扫描和启用流程。
---

# create-skill

用于把用户反复需要的流程沉淀成可复用技能。

## 使用场景

- 用户要求“新增一个 skill”。
- 用户有固定写作、校对、论文、文案或项目流程想保存。
- `find-skill` 没找到合适技能，需要创建新技能。

## 工作流程

1. 明确技能名、描述、触发场景、执行步骤。
2. 调用 `/api/skills/create` 或 `/create-skill 名称 :: 描述 :: 步骤`。
3. 将技能写入当前用户的 Karna Skills 目录（例如 `%APPDATA%\Karna\skills\<name>\SKILL.md`）。
4. 创建成功后提示路径，并确认技能页可见、可启用、可读取。
