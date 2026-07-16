package com.karna.android.core.sync

import com.karna.android.core.database.KarnaDatabase
import com.karna.android.core.network.RemoteApiService
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class SnapshotSync @Inject constructor(
    private val remoteApiService: RemoteApiService,
    private val database: KarnaDatabase,
    private val eventCursorManager: EventCursorManager,
    private val eventReducer: EventReducer,
    private val json: Json
) {
    suspend fun performFullSnapshot(): Result<String> = withContext(Dispatchers.IO) {
        runCatching {
            eventReducer.clearCache()

            val projectsResult = remoteApiService.getProjects()
            val projectsJson = projectsResult.getOrThrow()

            val conversationsResult = remoteApiService.getConversations()
            val conversationsJson = conversationsResult.getOrThrow()

            val filesResult = remoteApiService.getFiles()
            val filesJson = filesResult.getOrThrow()

            val newCursor = extractCursorFromSnapshot(projectsJson)
            newCursor?.let { eventCursorManager.saveCursor(it) }

            newCursor ?: ""
        }
    }

    private fun extractCursorFromSnapshot(snapshotJson: String): String? {
        return runCatching {
            val obj = json.parseToJsonElement(snapshotJson).jsonObject
            obj["cursor"]?.jsonPrimitive?.content
        }.getOrNull()
    }
}
