package com.karna.android.core.model

/**
 * 数据模型版本信息
 *
 * 用于序列化兼容性检查，协议握手时会验证版本匹配
 */
object ModelVersion {
    /**
     * 当前Schema版本号
     *
     * 当数据模型发生不兼容变更时递增此版本号
     */
    const val SCHEMA_VERSION: Int = 1
}
