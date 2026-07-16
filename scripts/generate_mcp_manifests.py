"""
批量生成 mcp-cn.com 上所有 MCP 的 manifest.yaml 文件
"""
import os
import yaml
from pathlib import Path

# MCP 列表：name, description, package, auth_type, source, tags
MCPS = [
    # 国际服务 - 高使用量
    ("context7", "基于Upstash的向量搜索和上下文管理MCP服务",
     "@upstash/context7-mcp", "api_key",
     "https://www.mcp-cn.com/server/67", ["向量搜索", "上下文管理"]),

    ("n8n", "n8n工作流自动化平台的MCP服务器，提供完整的工作流管理、执行控制、凭证管理等功能",
     "@drballs/n8n-mcp-server", "api_key",
     "https://www.mcp-cn.com/server/129", ["工作流自动化", "流程管理"]),

    ("playwright", "基于Playwright的自动化测试和网页操作MCP工具",
     "@playwright/mcp", "none",
     "https://www.mcp-cn.com/server/64", ["自动化测试", "网页操作"]),

    ("markitdown", "MarkItDown MCP服务器，提供无Docker依赖的NPX包装器，支持直接运行Microsoft的markitdown-mcp服务器",
     "markitdown-mcp-npx", "none",
     "https://www.mcp-cn.com/server/132", ["MarkItDown", "文档转换"]),

    ("sequential-thinking", "帮助AI进行结构化思考和推理的MCP工具",
     "@modelcontextprotocol/server-sequential-thinking", "none",
     "https://www.mcp-cn.com/server/63", ["AI辅助思考", "推理工具"]),

    ("gmail-autoauth", "Gmail AutoAuth的MCP服务器，支持Gmail AutoAuth的读取和写入",
     "@gongrzhe/server-gmail-autoauth-mcp", "oauth",
     "https://www.mcp-cn.com/server/112", ["Gmail", "邮件"]),

    ("excel", "Excel文件的MCP服务器，支持Excel文件的读取和写入",
     "@negokaz/excel-mcp-server", "none",
     "https://www.mcp-cn.com/server/88", ["Excel", "数据处理"]),

    ("figma", "连接Figma的MCP服务器，支持设计文件管理和操作",
     "figma-developer-mcp", "api_key",
     "https://www.mcp-cn.com/server/70", ["设计工具", "Figma"]),

    ("filesystem", "文件系统操作的MCP服务器",
     "@modelcontextprotocol/server-filesystem", "none",
     "https://www.mcp-cn.com/server/79", ["文件系统", "文件管理"]),

    ("puppeteer", "基于Puppeteer的网页自动化和数据抓取MCP工具",
     "@modelcontextprotocol/server-puppeteer", "none",
     "https://www.mcp-cn.com/server/80", ["网页抓取", "自动化"]),

    ("feishu-doc", "飞书的MCP服务器，支持文档管理等功能",
     "feishu-mcp", "api_key",
     "https://www.mcp-cn.com/server/106", ["办公协作", "文档管理"]),

    ("amap", "高德地图的MCP服务器",
     "@amap/amap-maps-mcp-server", "api_key",
     "https://www.mcp-cn.com/server/82", ["地图", "导航"]),

    ("github", "连接GitHub的MCP服务器，支持仓库管理、问题跟踪、代码搜索等功能",
     "@modelcontextprotocol/server-github", "api_key",
     "https://www.mcp-cn.com/server/62", ["代码管理", "版本控制"]),

    ("task-master", "智能任务管理和自动化的MCP工具",
     "task-master-ai", "none",
     "https://www.mcp-cn.com/server/81", ["任务管理", "工作流"]),

    ("desktop-commander", "桌面自动化和系统操作的MCP工具",
     "@wonderwhy-er/desktop-commander", "none",
     "https://www.mcp-cn.com/server/71", ["桌面自动化", "系统管理"]),

    ("postgres", "PostgreSQL的MCP服务器，支持PostgreSQL的读取和写入",
     "@modelcontextprotocol/server-postgres", "api_key",
     "https://www.mcp-cn.com/server/83", ["数据库", "PostgreSQL"]),

    ("brave-search", "基于Brave搜索引擎的MCP服务器，提供安全、私密的搜索服务",
     "@modelcontextprotocol/server-brave-search", "api_key",
     "https://www.mcp-cn.com/server/84", ["搜索引擎", "隐私保护"]),

    ("supabase", "连接Supabase数据库的MCP服务器，支持数据管理和查询",
     "@supabase/mcp-server-supabase", "api_key",
     "https://www.mcp-cn.com/server/22", ["数据库", "后端服务"]),

    ("memory", "提供内存管理和数据缓存的MCP服务器",
     "@modelcontextprotocol/server-memory", "none",
     "https://www.mcp-cn.com/server/85", ["内存管理", "数据缓存"]),

    ("firecrawl", "基于Firecrawl的智能网页爬取和内容提取MCP工具",
     "firecrawl-mcp", "api_key",
     "https://www.mcp-cn.com/server/68", ["网页爬虫", "内容提取"]),

    ("antv-chart", "基于AntV的图表生成MCP工具，支持多种图表类型的创建和渲染",
     "@antv/mcp-server-chart", "none",
     "https://www.mcp-cn.com/server/103", ["数据可视化", "图表工具"]),

    ("browser-tools", "提供浏览器自动化操作的MCP工具集",
     "@agentdeskai/browser-tools-mcp", "none",
     "https://www.mcp-cn.com/server/69", ["浏览器工具", "自动化操作"]),

    ("slack", "连接Slack的MCP服务器，支持消息发送、频道管理和工作流自动化",
     "@modelcontextprotocol/server-slack", "api_key",
     "https://www.mcp-cn.com/server/86", ["团队协作", "即时通讯"]),

    ("notion", "连接Notion的MCP服务器，支持页面管理和数据操作",
     "@modelcontextprotocol/server-notion", "api_key",
     "https://www.mcp-cn.com/server/65", ["笔记工具", "知识管理"]),

    ("mysql", "MySQL数据库的MCP服务器，支持数据库操作和管理",
     "@benborla29/mcp-server-mysql", "api_key",
     "https://www.mcp-cn.com/server/90", ["数据库", "MySQL"]),

    ("magic-ui", "多功能AI辅助工具的MCP服务器",
     "@21st-dev/magic", "none",
     "https://www.mcp-cn.com/server/73", ["AI辅助", "多功能工具"]),

    ("everything", "MCP协议功能测试服务器，展示MCP的所有功能特性",
     "@modelcontextprotocol/server-everything", "none",
     "https://www.mcp-cn.com/server/115", ["MCP测试", "功能演示"]),

    ("12306", "12306的MCP服务器，支持12306的读取",
     "12306-mcp", "none",
     "https://www.mcp-cn.com/server/102", ["12306", "火车票"]),

    ("browser-mcp", "浏览器自动化集成的MCP服务器，支持操纵浏览器",
     "@browsermcp/mcp", "none",
     "https://www.mcp-cn.com/server/75", ["浏览器集成", "网页操作"]),

    ("tavily", "基于Tavily的智能搜索MCP服务器，提供高质量的网络搜索结果",
     "tavily-mcp", "api_key",
     "https://www.mcp-cn.com/server/87", ["搜索引擎", "网络搜索"]),

    ("hotnews", "HotNews的MCP服务器，支持国内热点新闻的读取",
     "@wopal/mcp-server-hotnews", "none",
     "https://www.mcp-cn.com/server/99", ["HotNews", "热点新闻"]),

    ("apify-actors", "Apify Actors MCP服务器，提供与各种Apify Actor的交互能力",
     "@apify/actors-mcp-server", "api_key",
     "https://www.mcp-cn.com/server/130", ["网页抓取", "数据提取"]),

    ("bytefun-ai", "ByteFun AI MCP服务 - 打通产品设计、UI设计、代码开发的服务平台",
     "bytefun-ai-mcp", "api_key",
     "https://www.mcp-cn.com/server/135", ["ByteFunAI", "设计转代码"]),

    ("bilibili", "Bilibili的MCP服务器，支持Bilibili的内容搜索",
     "bilibili-mcp", "none",
     "https://www.mcp-cn.com/server/108", ["Bilibili", "视频搜索"]),

    ("jimeng", "即梦AI图像生成服务的MCP服务器，支持即梦AI图像生成服务",
     "jimeng-mcp", "api_key",
     "https://www.mcp-cn.com/server/111", ["即梦AI", "图像生成"]),

    ("exa-search", "基于Exa的高质量网络搜索MCP服务器",
     "exa-mcp-server", "api_key",
     "https://www.mcp-cn.com/server/77", ["搜索引擎", "网络搜索"]),

    ("quickchart", "QuickChart的MCP服务器，支持图表生成和数据可视化",
     "@gongrzhe/quickchart-mcp-server", "none",
     "https://www.mcp-cn.com/server/94", ["图表生成", "数据可视化"]),

    ("mastra", "mastra MCP服务器，支持mastra.ai生态",
     "@mastra/mcp-docs-server", "none",
     "https://www.mcp-cn.com/server/89", ["Mastra", "MCP文档"]),

    ("gitlab", "GitLab的MCP服务器，支持GitLab的读取和写入",
     "@zereight/mcp-gitlab", "api_key",
     "https://www.mcp-cn.com/server/91", ["GitLab", "版本控制"]),

    ("deepwiki", "非官方的DeepWiki MCP服务器，通过MCP接收DeepWiki URL，爬取所有相关页面并转换为Markdown格式",
     "mcp-deepwiki", "none",
     "https://www.mcp-cn.com/server/116", ["DeepWiki", "文档抓取"]),

    ("bing-cn", "一个基于MCP的中文必应搜索工具，可以直接通过Claude或其他支持MCP的AI来搜索必应并获取网页内容",
     "bing-cn-mcp", "none",
     "https://www.mcp-cn.com/server/126", ["必应搜索", "中文搜索"]),

    ("lark", "飞书/Lark官方OpenAPI MCP工具，支持文档处理、对话管理、日历调度等自动化场景",
     "@larksuiteoapi/lark-mcp", "api_key",
     "https://www.mcp-cn.com/server/128", ["飞书", "Lark", "办公协作"]),

    ("edgeone-pages", "Tencent EdgeOne Pages的MCP服务器，支持页面管理和部署",
     "edgeone-pages-mcp", "api_key",
     "https://www.mcp-cn.com/server/93", ["页面部署", "CDN"]),

    ("redis", "Redis的MCP服务器，支持Redis的读取和写入",
     "@modelcontextprotocol/server-redis", "api_key",
     "https://www.mcp-cn.com/server/96", ["数据库", "Redis"]),

    ("youtube-transcript", "通过模型上下文协议(MCP)从YouTube视频中提取字幕和转录文本的服务器",
     "@kimtaeyoon83/mcp-server-youtube-transcript", "none",
     "https://www.mcp-cn.com/server/119", ["YouTube", "字幕提取"]),

    ("wikipedia", "Wikipedia MCP服务器，提供与维基百科API的交互能力，包括文章搜索、内容获取、历史事件查询、图片检索等功能",
     "@shelm/wikipedia-mcp-server", "none",
     "https://www.mcp-cn.com/server/131", ["维基百科", "知识库"]),

    ("weread", "微信读书的MCP服务器，支持微信读书的读取和写入",
     "mcp-server-weread", "api_key",
     "https://www.mcp-cn.com/server/110", ["微信读书", "阅读"]),

    ("trends-hub", "基于MCP协议的全网热点趋势一站式聚合服务，支持多平台热点数据获取、趋势分析和内容聚合",
     "mcp-trends-hub", "none",
     "https://www.mcp-cn.com/server/124", ["热点趋势", "聚合服务"]),

    ("minimax", "MiniMax MCP服务器，提供图像生成、视频生成、文本转语音等多种AI功能",
     "minimax-mcp", "api_key",
     "https://www.mcp-cn.com/server/114", ["MiniMax", "AI生成"]),

    ("obsidian", "Obsidian的MCP服务器，支持Obsidian的读取和写入",
     "mcp-obsidian", "api_key",
     "https://www.mcp-cn.com/server/101", ["Obsidian", "笔记工具"]),

    ("perplexity-ask", "Perplexity Ask的MCP服务器，支持Perplexity Ask的读取",
     "server-perplexity-ask", "api_key",
     "https://www.mcp-cn.com/server/100", ["Perplexity", "AI搜索"]),

    ("stripe", "Stripe的MCP服务器，支持Stripe的读取和写入",
     "@stripe/mcp", "api_key",
     "https://www.mcp-cn.com/server/92", ["Stripe", "支付"]),

    ("mongodb", "MongoDB的MCP服务器，支持MongoDB的读取和写入",
     "mongodb-mcp-server", "api_key",
     "https://www.mcp-cn.com/server/95", ["数据库", "MongoDB"]),

    ("kubernetes", "Kubernetes的MCP服务器，支持Kubernetes的读取和写入",
     "mcp-server-kubernetes", "api_key",
     "https://www.mcp-cn.com/server/97", ["容器", "Kubernetes"]),

    ("metamcp", "MetaMCP是一个代理服务器，将多个MCP服务器整合为一个",
     "@metamcp/mcp-server-metamcp", "none",
     "https://www.mcp-cn.com/server/121", ["MetaMCP", "代理服务器"]),

    ("airbnb", "Airbnb MCP服务器，提供Airbnb房源搜索和获取房源详情功能",
     "@openbnb/mcp-server-airbnb", "none",
     "https://www.mcp-cn.com/server/117", ["Airbnb", "民宿搜索"]),

    ("xcodebuild", "Xcode项目构建和管理的MCP工具",
     "xcodebuildmcp", "none",
     "https://www.mcp-cn.com/server/78", ["iOS开发", "Xcode"]),

    ("cloudflare", "连接Cloudflare服务的MCP服务器，支持DNS和CDN管理",
     "@cloudflare/mcp-server-cloudflare", "api_key",
     "https://www.mcp-cn.com/server/72", ["云服务", "CDN"]),

    ("alipay", "支付宝开放平台提供的MCP Server，让你可以轻松将支付宝开放平台提供的交易创建、查询、退款等能力集成到你的LLM应用中",
     "@alipay/mcp-server-alipay", "api_key",
     "https://www.mcp-cn.com/server/127", ["支付宝", "支付"]),

    ("elasticsearch", "通过模型上下文协议(MCP)连接Elasticsearch数据的实验性服务器",
     "@elastic/mcp-server-elasticsearch", "api_key",
     "https://www.mcp-cn.com/server/118", ["ElasticSearch", "搜索引擎"]),

    ("whois", "WHOIS MCP服务允许AI代理执行WHOIS查询并检索域名详细信息",
     "@bharathvaj/whois-mcp", "none",
     "https://www.mcp-cn.com/server/134", ["WHOIS", "域名查询"]),

    ("apple", "Apple生态系统集成的MCP工具",
     "@dhravya/apple-mcp", "none",
     "https://www.mcp-cn.com/server/76", ["Apple生态", "macOS"]),

    ("flomo", "连接flomo的MCP服务器，支持卡片式笔记管理",
     "mcp-server-flomo", "api_key",
     "https://www.mcp-cn.com/server/66", ["flomo", "笔记工具"]),

    ("neon", "Neon数据库MCP服务器是一个开源工具，允许您使用自然语言与Neon Postgres数据库进行交互",
     "@neondatabase/mcp-server-neon", "api_key",
     "https://www.mcp-cn.com/server/122", ["Neon", "数据库"]),

    ("searxng", "通过模型上下文协议(MCP)集成SearXNG搜索引擎的服务器，提供隐私保护的网络搜索功能",
     "mcp-searxng", "api_key",
     "https://www.mcp-cn.com/server/120", ["SearXNG", "搜索引擎"]),

    ("twitter", "Twitter MCP服务器允许客户端与Twitter进行交互，支持发布推文和搜索Twitter内容",
     "@enescinar/twitter-mcp", "api_key",
     "https://www.mcp-cn.com/server/123", ["Twitter", "社交媒体"]),

    ("cloudbase", "基于MCP协议的AI编程助手一键部署服务，支持在Cursor/VSCode等AI编程工具中自动生成前后端应用+小程序",
     "@cloudbase/cloudbase-mcp", "api_key",
     "https://www.mcp-cn.com/server/125", ["腾讯云", "AI编程助手"]),

    ("leetcode", "LeetCode的MCP服务器，支持LeetCode的读取和写入",
     "@jinzcdev/leetcode-mcp-server", "api_key",
     "https://www.mcp-cn.com/server/107", ["LeetCode", "算法练习"]),

    ("apifox", "Apifox的MCP服务器，支持Apifox的读取和写入",
     "@wangmhaha/apifox-mcp-server", "api_key",
     "https://www.mcp-cn.com/server/109", ["Apifox", "API工具"]),

    ("chef-recipe", "Chef Recipe的MCP服务器，支持菜谱搜索和食谱管理",
     "chef-recipe-mcp-server", "none",
     "https://www.mcp-cn.com/server/113", ["菜谱", "食谱"]),

    ("gitee", "Gitee的MCP服务器，支持代码仓库管理、问题跟踪等功能",
     "@gitee/mcp-gitee", "api_key",
     "https://www.mcp-cn.com/server/105", ["Gitee", "代码管理"]),

    ("tencent-cos", "腾讯云对象存储(COS)的MCP服务器，支持文件上传、下载和管理",
     "cos-mcp", "api_key",
     "https://www.mcp-cn.com/server/104", ["腾讯云COS", "云存储"]),

    ("yeepay", "Yeepay MCP服务通过模型上下文协议(MCP)集成易宝支付服务",
     "@yeepay/yeepay-mcp", "api_key",
     "https://www.mcp-cn.com/server/133", ["易宝支付", "支付"]),

    ("meigen", "让AI助手具备设计能力，支持本地ComfyUI、MeiGen云端、OpenAI兼容API三种后端",
     "meigen", "api_key",
     "https://www.mcp-cn.com/server/136", ["AI设计", "图片生成"]),
]


def generate_manifest_data(name, description, package, auth_type, source, tags):
    """生成单个 MCP 的 manifest 数据字典"""

    data = {
        "manifest_version": 1,
        "name": name,
        "description": description,
        "source": source,
        "transport": {
            "type": "stdio",
            "command": "npx",
            "args": ["-y", package],
        },
        "auth": {"type": auth_type},
    }

    if auth_type == "api_key":
        env_var_name = f"{name.upper().replace('-', '_')}_API_KEY"
        data["auth"]["env"] = [
            {
                "name": env_var_name,
                "prompt": f"{name} API Key",
                "required": True,
                "secret": True,
            }
        ]

    data["post_install"] = (
        f"{name} MCP 已安装。启动新会话以加载工具。\n"
        f"如需 API Key，请配置环境变量。\n"
    )

    return data


def main():
    output_dir = Path(r"d:\Agent\projects\karna-hermes\optional-mcps")

    created = 0
    skipped = 0

    for name, description, package, auth_type, source, tags in MCPS:
        mcp_dir = output_dir / name

        # 跳过已存在的（官方维护的）
        if mcp_dir.exists():
            print(f"跳过已存在: {name}")
            skipped += 1
            continue

        mcp_dir.mkdir(parents=True, exist_ok=True)
        manifest_path = mcp_dir / "manifest.yaml"
        data = generate_manifest_data(name, description, package, auth_type, source, tags)

        with open(manifest_path, "w", encoding="utf-8") as f:
            yaml.dump(data, f, allow_unicode=True, default_flow_style=False, sort_keys=False)

        print(f"已创建: {name}")
        created += 1

    print(f"\n完成！创建 {created} 个，跳过 {skipped} 个")


if __name__ == "__main__":
    main()

