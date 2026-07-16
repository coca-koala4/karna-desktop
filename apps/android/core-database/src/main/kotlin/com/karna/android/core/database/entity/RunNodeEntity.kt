package com.karna.android.core.database.entity

import androidx.room.Entity
import androidx.room.PrimaryKey

@Entity(tableName = "run_nodes")
data class RunNodeEntity(
    @PrimaryKey val id: String,
    val runId: String,
    val parentNodeId: String? = null,
    val type: String,
    val name: String = "",
    val state: String,
    val contentJson: String? = null,
    val metadataJson: String? = null,
    val error: String? = null,
    val createdAtTimestamp: Long = System.currentTimeMillis(),
    val startedAtTimestamp: Long? = null,
    val completedAtTimestamp: Long? = null
)
