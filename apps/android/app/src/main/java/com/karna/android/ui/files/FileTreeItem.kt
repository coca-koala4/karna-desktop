package com.karna.android.ui.files

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AudioFile
import androidx.compose.material.icons.filled.ChevronRight
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.Folder
import androidx.compose.material.icons.filled.FolderOpen
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.InsertDriveFile
import androidx.compose.material.icons.filled.PictureAsPdf
import androidx.compose.material.icons.filled.VideoFile
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.karna.android.core.database.entity.FileDescriptorEntity
import java.io.File

data class FileTreeNode(
    val name: String,
    val path: String,
    val isDirectory: Boolean,
    val file: FileDescriptorEntity? = null,
    val children: MutableList<FileTreeNode> = mutableListOf(),
    var isExpanded: Boolean = false
)

@Composable
fun FileTreeItem(
    node: FileTreeNode,
    depth: Int = 0,
    onFileClick: (FileDescriptorEntity) -> Unit,
    modifier: Modifier = Modifier
) {
    var expanded by remember { mutableStateOf(node.isExpanded) }

    Column(modifier = modifier.fillMaxWidth()) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clickable {
                    if (node.isDirectory) {
                        expanded = !expanded
                        node.isExpanded = expanded
                    } else {
                        node.file?.let { onFileClick(it) }
                    }
                },
            color = MaterialTheme.colorScheme.surface
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(start = (depth * 16).dp, end = 16.dp, top = 12.dp, bottom = 12.dp),
                verticalAlignment = Alignment.CenterVertically
            ) {
                if (node.isDirectory) {
                    Icon(
                        imageVector = if (expanded) Icons.Filled.ExpandLess else Icons.Filled.ChevronRight,
                        contentDescription = null,
                        modifier = Modifier.size(20.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.width(4.dp))
                    Icon(
                        imageVector = if (expanded) Icons.Filled.FolderOpen else Icons.Filled.Folder,
                        contentDescription = null,
                        modifier = Modifier.size(24.dp),
                        tint = MaterialTheme.colorScheme.primary
                    )
                } else {
                    Spacer(modifier = Modifier.width(24.dp))
                    FileTypeIcon(
                        fileName = node.name,
                        mimeType = node.file?.mimeType,
                        modifier = Modifier.size(24.dp)
                    )
                }

                Spacer(modifier = Modifier.width(12.dp))

                Text(
                    text = node.name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )

                if (!node.isDirectory && node.file != null) {
                    Text(
                        text = formatFileSize(node.file.sizeBytes),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }

        if (node.isDirectory && expanded && node.children.isNotEmpty()) {
            Column {
                node.children.forEach { child ->
                    FileTreeItem(
                        node = child,
                        depth = depth + 1,
                        onFileClick = onFileClick
                    )
                }
            }
        }
    }
}

@Composable
fun FileTypeIcon(
    fileName: String,
    mimeType: String?,
    modifier: Modifier = Modifier
) {
    val icon = when {
        mimeType?.startsWith("image/") == true -> Icons.Filled.Image
        mimeType?.startsWith("video/") == true -> Icons.Filled.VideoFile
        mimeType?.startsWith("audio/") == true -> Icons.Filled.AudioFile
        mimeType == "application/pdf" || fileName.endsWith(".pdf", true) -> Icons.Filled.PictureAsPdf
        fileName.endsWith(".md", true) || fileName.endsWith(".txt", true) -> Icons.Filled.Description
        else -> Icons.Filled.InsertDriveFile
    }

    val tint = when {
        mimeType?.startsWith("image/") == true -> MaterialTheme.colorScheme.tertiary
        mimeType == "application/pdf" -> MaterialTheme.colorScheme.error
        fileName.endsWith(".md", true) -> MaterialTheme.colorScheme.primary
        else -> MaterialTheme.colorScheme.onSurfaceVariant
    }

    Icon(
        imageVector = icon,
        contentDescription = null,
        modifier = modifier,
        tint = tint
    )
}

fun buildFileTree(files: List<FileDescriptorEntity>): List<FileTreeNode> {
    val rootNodes = mutableListOf<FileTreeNode>()
    val nodeMap = mutableMapOf<String, FileTreeNode>()

    val sortedFiles = files.sortedBy { it.path }

    sortedFiles.forEach { file ->
        val path = file.path?.ifEmpty { file.name } ?: file.name
        val parts = path.split("/", "\\").filter { it.isNotBlank() }
        var currentPath = ""
        var parentNode: FileTreeNode? = null

        for ((index, part) in parts.withIndex()) {
            val isFile = index == parts.lastIndex && !file.name.contains("/") && !file.name.contains("\\")
            val partPath = if (currentPath.isEmpty()) part else "$currentPath/$part"

            if (nodeMap.containsKey(partPath)) {
                parentNode = nodeMap[partPath]
            } else {
                val isDir = !isFile || part != file.name
                val node = FileTreeNode(
                    name = part,
                    path = partPath,
                    isDirectory = isDir,
                    file = if (isFile || part == file.name) file else null
                )
                nodeMap[partPath] = node

                if (parentNode != null) {
                    parentNode.children.add(node)
                } else {
                    rootNodes.add(node)
                }
                parentNode = node
            }
            currentPath = partPath
        }
    }

    fun sortNodes(nodes: MutableList<FileTreeNode>) {
        nodes.sortWith(compareByDescending<FileTreeNode> { it.isDirectory }.thenBy { it.name.lowercase() })
        nodes.forEach { sortNodes(it.children) }
    }
    sortNodes(rootNodes)

    return rootNodes
}

fun formatFileSize(bytes: Long): String {
    return when {
        bytes >= 1_000_000_000 -> String.format("%.1f GB", bytes / 1_000_000_000.0)
        bytes >= 1_000_000 -> String.format("%.1f MB", bytes / 1_000_000.0)
        bytes >= 1_000 -> String.format("%.1f KB", bytes / 1_000.0)
        else -> "$bytes B"
    }
}
