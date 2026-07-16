package com.karna.android.di

import android.content.Context
import androidx.room.Room
import com.karna.android.core.database.KarnaDatabase
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
import dagger.Module
import dagger.Provides
import dagger.hilt.InstallIn
import dagger.hilt.android.qualifiers.ApplicationContext
import dagger.hilt.components.SingletonComponent
import javax.inject.Singleton

@Module
@InstallIn(SingletonComponent::class)
object DatabaseModule {

    @Provides
    @Singleton
    fun provideKarnaDatabase(
        @ApplicationContext context: Context
    ): KarnaDatabase {
        return Room.databaseBuilder(
            context,
            KarnaDatabase::class.java,
            KarnaDatabase.DATABASE_NAME
        )
            .fallbackToDestructiveMigration()
            .build()
    }

    @Provides
    fun provideDeviceDao(database: KarnaDatabase): DeviceDao {
        return database.deviceDao()
    }

    @Provides
    fun provideProjectDao(database: KarnaDatabase): ProjectDao {
        return database.projectDao()
    }

    @Provides
    fun provideConversationDao(database: KarnaDatabase): ConversationDao {
        return database.conversationDao()
    }

    @Provides
    fun provideMessageDao(database: KarnaDatabase): MessageDao {
        return database.messageDao()
    }

    @Provides
    fun provideMessageStreamFragmentDao(database: KarnaDatabase): MessageStreamFragmentDao {
        return database.messageStreamFragmentDao()
    }

    @Provides
    fun provideRunDao(database: KarnaDatabase): RunDao {
        return database.runDao()
    }

    @Provides
    fun provideInteractionDao(database: KarnaDatabase): InteractionDao {
        return database.interactionDao()
    }

    @Provides
    fun provideFileDao(database: KarnaDatabase): FileDao {
        return database.fileDao()
    }

    @Provides
    fun provideEventCursorDao(database: KarnaDatabase): EventCursorDao {
        return database.eventCursorDao()
    }

    @Provides
    fun provideCommandOutboxDao(database: KarnaDatabase): CommandOutboxDao {
        return database.commandOutboxDao()
    }

    @Provides
    fun provideDraftDao(database: KarnaDatabase): DraftDao {
        return database.draftDao()
    }

    @Provides
    fun providePlanDao(database: KarnaDatabase): PlanDao {
        return database.planDao()
    }

    @Provides
    fun provideGoalDao(database: KarnaDatabase): GoalDao {
        return database.goalDao()
    }

    @Provides
    fun provideLivingWorkDao(database: KarnaDatabase): LivingWorkDao {
        return database.livingWorkDao()
    }
}
