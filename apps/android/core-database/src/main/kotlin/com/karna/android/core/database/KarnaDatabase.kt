package com.karna.android.core.database

import androidx.room.Database
import androidx.room.RoomDatabase
import androidx.room.TypeConverters
import com.karna.android.core.database.converter.Converters
import com.karna.android.core.database.dao.CommandOutboxDao
import com.karna.android.core.database.dao.ConversationDao
import com.karna.android.core.database.dao.DeviceDao
import com.karna.android.core.database.dao.DraftDao
import com.karna.android.core.database.dao.EventCursorDao
import com.karna.android.core.database.dao.FileDao
import com.karna.android.core.database.dao.GoalDao
import com.karna.android.core.database.dao.InteractionDao
import com.karna.android.core.database.dao.LivingWorkDao
import com.karna.android.core.database.dao.MessageDao
import com.karna.android.core.database.dao.MessageStreamFragmentDao
import com.karna.android.core.database.dao.PlanDao
import com.karna.android.core.database.dao.ProjectDao
import com.karna.android.core.database.dao.RunDao
import com.karna.android.core.database.entity.CommandOutboxEntity
import com.karna.android.core.database.entity.ConversationEntity
import com.karna.android.core.database.entity.DesktopDeviceEntity
import com.karna.android.core.database.entity.DraftEntity
import com.karna.android.core.database.entity.EventCursorEntity
import com.karna.android.core.database.entity.FileDescriptorEntity
import com.karna.android.core.database.entity.GoalEntity
import com.karna.android.core.database.entity.InteractionEntity
import com.karna.android.core.database.entity.LivingWorkEntity
import com.karna.android.core.database.entity.MessageEntity
import com.karna.android.core.database.entity.MessageStreamFragmentEntity
import com.karna.android.core.database.entity.PlanEntity
import com.karna.android.core.database.entity.ProjectEntity
import com.karna.android.core.database.entity.RunEntity
import com.karna.android.core.database.entity.RunNodeEntity

@Database(
    entities = [
        DesktopDeviceEntity::class,
        ProjectEntity::class,
        ConversationEntity::class,
        MessageEntity::class,
        MessageStreamFragmentEntity::class,
        RunEntity::class,
        RunNodeEntity::class,
        InteractionEntity::class,
        FileDescriptorEntity::class,
        EventCursorEntity::class,
        CommandOutboxEntity::class,
        DraftEntity::class,
        PlanEntity::class,
        GoalEntity::class,
        LivingWorkEntity::class
    ],
    version = 2,
    exportSchema = true
)
@TypeConverters(Converters::class)
abstract class KarnaDatabase : RoomDatabase() {

    abstract fun deviceDao(): DeviceDao
    abstract fun projectDao(): ProjectDao
    abstract fun conversationDao(): ConversationDao
    abstract fun messageDao(): MessageDao
    abstract fun messageStreamFragmentDao(): MessageStreamFragmentDao
    abstract fun runDao(): RunDao
    abstract fun interactionDao(): InteractionDao
    abstract fun fileDao(): FileDao
    abstract fun eventCursorDao(): EventCursorDao
    abstract fun commandOutboxDao(): CommandOutboxDao
    abstract fun draftDao(): DraftDao
    abstract fun planDao(): PlanDao
    abstract fun goalDao(): GoalDao
    abstract fun livingWorkDao(): LivingWorkDao

    companion object {
        const val DATABASE_NAME = "karna.db"
    }
}
