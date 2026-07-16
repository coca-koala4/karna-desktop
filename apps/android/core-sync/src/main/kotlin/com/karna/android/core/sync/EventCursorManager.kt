package com.karna.android.core.sync

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.cursorDataStore: DataStore<Preferences> by preferencesDataStore(name = "event_cursor")

@Singleton
class EventCursorManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private object Keys {
        val CURRENT_CURSOR = stringPreferencesKey("current_cursor")
        val LAST_SYNC_TIMESTAMP = longPreferencesKey("last_sync_timestamp")
    }

    data class CursorInfo(
        val cursor: String?,
        val lastSyncTimestamp: Long
    )

    val cursorFlow: Flow<CursorInfo> = context.cursorDataStore.data.map { prefs ->
        CursorInfo(
            cursor = prefs[Keys.CURRENT_CURSOR],
            lastSyncTimestamp = prefs[Keys.LAST_SYNC_TIMESTAMP] ?: 0L
        )
    }

    suspend fun getCurrentCursor(): String? {
        return cursorFlow.first().cursor
    }

    suspend fun saveCursor(cursor: String) {
        context.cursorDataStore.edit { prefs ->
            prefs[Keys.CURRENT_CURSOR] = cursor
            prefs[Keys.LAST_SYNC_TIMESTAMP] = System.currentTimeMillis()
        }
    }

    suspend fun clearCursor() {
        context.cursorDataStore.edit { prefs ->
            prefs.remove(Keys.CURRENT_CURSOR)
            prefs.remove(Keys.LAST_SYNC_TIMESTAMP)
        }
    }

    suspend fun isCursorStale(maxAgeMs: Long = 24 * 60 * 60 * 1000L): Boolean {
        val info = cursorFlow.first()
        if (info.cursor == null) return true
        val age = System.currentTimeMillis() - info.lastSyncTimestamp
        return age > maxAgeMs
    }
}
