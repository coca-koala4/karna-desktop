package com.karna.android.core.preview

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.booleanOrNull
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.longOrNull
import java.io.File
import javax.inject.Inject
import javax.inject.Singleton

sealed class JsonTreeNode {
    data class ObjectNode(
        val key: String,
        val children: List<JsonTreeNode>,
        val depth: Int,
        var expanded: Boolean = false
    ) : JsonTreeNode()

    data class ArrayNode(
        val key: String,
        val children: List<JsonTreeNode>,
        val depth: Int,
        var expanded: Boolean = false
    ) : JsonTreeNode()

    data class PrimitiveNode(
        val key: String,
        val value: String,
        val type: PrimitiveType,
        val depth: Int
    ) : JsonTreeNode()
}

enum class PrimitiveType {
    STRING, NUMBER, BOOLEAN, NULL
}

@Singleton
class JsonPreviewHandler @Inject constructor(
    private val json: Json
) {
    companion object {
        private const val MAX_JSON_SIZE = 1L * 1024 * 1024
        private const val MAX_PREVIEW_DEPTH = 10
    }

    fun parseJson(jsonString: String): Result<JsonElement> {
        return runCatching {
            json.parseToJsonElement(jsonString)
        }
    }

    fun parseFile(file: File, maxSize: Long = MAX_JSON_SIZE): Result<JsonElement> {
        return runCatching {
            if (file.length() > maxSize) {
                throw IllegalArgumentException("File too large to preview")
            }
            val text = file.readText()
            json.parseToJsonElement(text)
        }
    }

    fun buildTree(element: JsonElement, key: String = "root", depth: Int = 0): JsonTreeNode {
        return when (element) {
            is JsonObject -> buildObjectNode(element, key, depth)
            is JsonArray -> buildArrayNode(element, key, depth)
            is JsonPrimitive -> buildPrimitiveNode(element, key, depth)
        }
    }

    private fun buildObjectNode(obj: JsonObject, key: String, depth: Int): JsonTreeNode.ObjectNode {
        val children = if (depth < MAX_PREVIEW_DEPTH) {
            obj.entries.map { (k, v) -> buildTree(v, k, depth + 1) }
        } else {
            listOf(JsonTreeNode.PrimitiveNode("...", "{...}", PrimitiveType.STRING, depth + 1))
        }
        return JsonTreeNode.ObjectNode(key, children, depth, depth == 0)
    }

    private fun buildArrayNode(array: JsonArray, key: String, depth: Int): JsonTreeNode.ArrayNode {
        val children = if (depth < MAX_PREVIEW_DEPTH) {
            array.mapIndexed { index, element ->
                buildTree(element, "[$index]", depth + 1)
            }
        } else {
            listOf(JsonTreeNode.PrimitiveNode("...", "[...]", PrimitiveType.STRING, depth + 1))
        }
        return JsonTreeNode.ArrayNode(key, children, depth, depth == 0)
    }

    private fun buildPrimitiveNode(primitive: JsonPrimitive, key: String, depth: Int): JsonTreeNode.PrimitiveNode {
        val (value, type) = when {
            primitive.isString -> Pair(primitive.contentOrNull ?: "", PrimitiveType.STRING)
            primitive.booleanOrNull != null -> Pair(primitive.booleanOrNull.toString(), PrimitiveType.BOOLEAN)
            primitive.longOrNull != null -> Pair(primitive.longOrNull.toString(), PrimitiveType.NUMBER)
            primitive.doubleOrNull != null -> Pair(primitive.doubleOrNull.toString(), PrimitiveType.NUMBER)
            else -> Pair("null", PrimitiveType.NULL)
        }
        return JsonTreeNode.PrimitiveNode(key, value, type, depth)
    }

    fun formatPretty(jsonString: String): Result<String> {
        return parseJson(jsonString).map { element ->
            json.encodeToString(JsonElement.serializer(), element)
        }
    }

    fun formatCompact(jsonString: String): Result<String> {
        return parseJson(jsonString).map { element ->
            json.encodeToString(JsonElement.serializer(), element).replace(Regex("\\s+"), "")
        }
    }

    fun flattenForPreview(node: JsonTreeNode, maxItems: Int = 100): List<Pair<String, String>> {
        val result = mutableListOf<Pair<String, String>>()
        flattenNode(node, result, maxItems, 0)
        return result
    }

    private fun flattenNode(node: JsonTreeNode, result: MutableList<Pair<String, String>>, maxItems: Int, currentCount: Int): Int {
        var count = currentCount
        if (count >= maxItems) return count

        when (node) {
            is JsonTreeNode.ObjectNode -> {
                val prefix = "  ".repeat(node.depth)
                if (node.depth > 0) {
                    result.add(Pair("$prefix${node.key}:", "{"))
                    count++
                }
                if (node.expanded || node.depth == 0) {
                    for (child in node.children) {
                        if (count >= maxItems) break
                        count = flattenNode(child, result, maxItems, count)
                    }
                }
                if (node.depth > 0 && count < maxItems) {
                    result.add(Pair("$prefix}", ""))
                    count++
                }
            }
            is JsonTreeNode.ArrayNode -> {
                val prefix = "  ".repeat(node.depth)
                if (node.depth > 0) {
                    result.add(Pair("$prefix${node.key}:", "["))
                    count++
                }
                if (node.expanded || node.depth == 0) {
                    for (child in node.children) {
                        if (count >= maxItems) break
                        count = flattenNode(child, result, maxItems, count)
                    }
                }
                if (node.depth > 0 && count < maxItems) {
                    result.add(Pair("$prefix]", ""))
                    count++
                }
            }
            is JsonTreeNode.PrimitiveNode -> {
                val prefix = "  ".repeat(node.depth)
                val displayValue = when (node.type) {
                    PrimitiveType.STRING -> "\"${node.value}\""
                    else -> node.value
                }
                result.add(Pair("$prefix${node.key}:", displayValue))
                count++
            }
        }
        return count
    }
}
