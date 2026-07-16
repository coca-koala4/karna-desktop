package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "files")
data class FileDescriptorEntity(
    @PrimaryKey val id: String,
    val projectId: String? = null,
    val name: String,
    val fileName: String = "",
    val fileType: String = "other",
    val path: String? = null,
    val mimeType: String,
    val size: Long = 0,
    val sizeBytes: Long = 0,
    val hash: String = "",
    val checksum: String? = null,
    val localPath: String? = null,
    val isUploaded: Boolean = false,
    val remoteUrl: String? = null,
    val createdAt: Long = System.currentTimeMillis(),
    val modifiedAt: Long = System.currentTimeMillis(),
    val createdAtTimestamp: Long = System.currentTimeMillis(),
    val updatedAtTimestamp: Long = System.currentTimeMillis()
)
