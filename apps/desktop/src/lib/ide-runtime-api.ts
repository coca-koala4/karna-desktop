/**
 * Writer IDE 运行时 API 请求接口
 */
interface HermesApiRequest {
  path: string
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH'
  body?: unknown
}

/**
 * Hermes 桌面端 API 接口
 */
interface HermesDesktop {
  api: <T>(request: HermesApiRequest) => Promise<T>
}

/**
 * 获取桌面端 API 实例
 * @returns 桌面端 API 调用函数
 */
function getDesktopApi(): HermesDesktop['api'] {
  if (typeof window === 'undefined') {
    throw new Error('当前窗口不可用')
  }
  const desktop = (window as unknown as { hermesDesktop?: HermesDesktop; karnaDesktop?: HermesDesktop }).karnaDesktop
    || (window as unknown as { hermesDesktop?: HermesDesktop }).hermesDesktop
  if (!desktop) {
    throw new Error('Karna desktop API not available')
  }
  return desktop.api.bind(desktop)
}

/** API 路径前缀 */
const API_PREFIX = '/api/ide/runtime'

/**
 * 运行时状态枚举
 * - starting: 启动中
 * - running: 运行中
 * - paused: 已暂停（调试模式）
 * - stopped: 已停止
 * - failed: 运行失败
 */
export type RuntimeState = 'starting' | 'running' | 'paused' | 'stopped' | 'failed'

/**
 * 运行时会话接口
 * 表示一个代码运行或调试会话
 */
export interface RuntimeSession {
  /** 会话唯一标识 */
  id: string
  /** 当前会话状态 */
  state: RuntimeState
  /** 编程语言 */
  language: string
  /** 运行的文件路径 */
  filePath: string
  /** 运行模式：运行或调试 */
  mode: 'run' | 'debug'
  /** 退出码（运行结束时） */
  exitCode?: number
  /** 运行时长（毫秒） */
  durationMs?: number
  /** 标准输出内容 */
  stdout: string
  /** 标准错误输出内容 */
  stderr: string
}

/**
 * 运行时事件接口
 * 用于通过 WebSocket 或事件流推送运行时状态变化
 */
export interface RuntimeEvent {
  /** 事件类型 */
  type: string
  /** 状态变更（状态事件时） */
  state?: RuntimeState
  /** 输出文本（输出事件时） */
  text?: string
  /** 相关文件路径 */
  file?: string
  /** 相关行号 */
  line?: number
  /** 事件消息 */
  message?: string
  /** 退出码 */
  exitCode?: number
  /** 运行时长 */
  durationMs?: number
}

/**
 * 调试栈帧接口
 * 表示调试时的调用栈信息
 */
export interface StackFrame {
  /** 栈帧唯一标识 */
  id: string
  /** 文件路径 */
  file: string
  /** 行号 */
  line: number
  /** 列号 */
  column?: number
  /** 函数名 */
  function?: string
}

/**
 * 调试变量接口
 * 表示调试时的变量信息，支持嵌套结构
 */
export interface DebugVariable {
  /** 变量名 */
  name: string
  /** 变量值（字符串表示） */
  value: string
  /** 变量类型 */
  type?: string
  /** 子变量（用于对象/数组等复杂类型） */
  variables?: DebugVariable[]
}

/**
 * 运行时配置接口
 * 定义代码运行的配置参数
 */
export interface RuntimeConfiguration {
  /** 配置唯一标识 */
  id: string
  /** 配置名称 */
  name: string
  /** 编程语言 */
  language: string
  /** 入口程序路径 */
  program: string
  /** 工作目录 */
  cwd?: string
  /** 命令行参数 */
  args?: string[]
  /** 环境变量配置 ID */
  envProfileId?: string | null
}

/**
 * 运行时能力接口
 * 描述当前运行时支持的功能
 */
export interface RuntimeCapabilities {
  /** 支持的编程语言列表 */
  languages: string[]
  /** 支持的运行模式 */
  supportedModes: ('run' | 'debug')[]
  /** 支持的功能特性 */
  features: {
    /** 是否支持标准输入 */
    input: boolean
    /** 是否支持断点 */
    breakpoints: boolean
    /** 是否支持单步执行 */
    stepExecution: boolean
    /** 是否支持变量查看 */
    variableInspection: boolean
  }
}

/**
 * 创建运行时会话参数接口
 */
export interface CreateRuntimeSessionParams {
  /** 要运行的文件路径 */
  filePath: string
  /** 编程语言 */
  language: string
  /** 运行模式 */
  mode: 'run' | 'debug'
  /** 运行时配置 */
  configuration?: RuntimeConfiguration
  /** 命令行参数 */
  args?: string[]
  /** 工作目录 */
  cwd?: string
  /** 环境变量 */
  env?: Record<string, string>
}

/**
 * 调试命令接口
 * 支持的调试操作命令
 */
export interface DebugCommand {
  /** 调试动作类型 */
  action: 'continue' | 'stepOver' | 'stepInto' | 'stepOut' | 'pause' | 'setBreakpoint' | 'removeBreakpoint' | 'getVariables' | 'getStack'
  /** 命令参数 */
  params?: Record<string, unknown>
}

/**
 * Writer IDE 运行时 API 客户端
 * 提供代码运行和调试相关的 API 调用
 */
export const ideRuntimeApi = {
  /**
   * 获取运行时能力
   * 查询当前环境支持的编程语言、运行模式和功能特性
   * @returns 运行时能力信息
   */
  getRuntimeCapabilities(): Promise<RuntimeCapabilities> {
    return getDesktopApi()({
      path: `${API_PREFIX}/capabilities`
    }) as Promise<RuntimeCapabilities>
  },

  /**
   * 创建运行/调试会话
   * 启动一个新的代码运行或调试会话
   * @param params - 创建会话的参数，包括文件路径、语言、模式等
   * @returns 创建成功返回会话信息，失败返回错误信息
   */
  createRuntimeSession(params: CreateRuntimeSessionParams): Promise<{ session: RuntimeSession } | { error: string }> {
    return getDesktopApi()({
      path: `${API_PREFIX}/sessions`,
      method: 'POST',
      body: params
    }) as Promise<{ session: RuntimeSession } | { error: string }>
  },

  /**
   * 发送输入到运行时
   * 向正在运行的程序发送标准输入文本
   * @param sessionId - 会话 ID
   * @param text - 要发送的输入文本
   * @returns 操作结果
   */
  sendRuntimeInput(sessionId: string, text: string): Promise<{ ok: boolean } | { error: string }> {
    return getDesktopApi()({
      path: `${API_PREFIX}/sessions/${sessionId}/input`,
      method: 'POST',
      body: { text }
    }) as Promise<{ ok: boolean } | { error: string }>
  },

  /**
   * 停止运行时会话
   * 终止正在运行或调试的程序
   * @param sessionId - 会话 ID
   * @returns 操作结果
   */
  stopRuntimeSession(sessionId: string): Promise<{ ok: boolean } | { error: string }> {
    return getDesktopApi()({
      path: `${API_PREFIX}/sessions/${sessionId}/stop`,
      method: 'POST'
    }) as Promise<{ ok: boolean } | { error: string }>
  },

  /**
   * 获取运行时会话状态
   * 查询指定会话的当前状态和输出
   * @param sessionId - 会话 ID
   * @returns 会话状态信息或错误
   */
  getRuntimeSession(sessionId: string): Promise<RuntimeSession | { error: string }> {
    return getDesktopApi()({
      path: `${API_PREFIX}/sessions/${sessionId}`
    }) as Promise<RuntimeSession | { error: string }>
  },

  /**
   * 发送调试命令
   * 在调试模式下发送调试操作命令，如继续、单步、查看变量等
   * @param sessionId - 会话 ID
   * @param command - 调试命令，包含动作类型和参数
   * @returns 调试操作结果，可能包含栈帧或变量信息
   */
  sendDebugCommand(sessionId: string, command: DebugCommand): Promise<{ ok: boolean; stack?: StackFrame[]; variables?: DebugVariable[] } | { error: string }> {
    return getDesktopApi()({
      path: `${API_PREFIX}/sessions/${sessionId}/debug`,
      method: 'POST',
      body: command
    }) as Promise<{ ok: boolean; stack?: StackFrame[]; variables?: DebugVariable[] } | { error: string }>
  }
}
